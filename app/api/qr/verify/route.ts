import { getPool, databaseError } from '@/lib/db';
import { hashInspectionToken, matchesInspectionTokenRecord, parseInspectionToken } from '@/lib/inspection-token';
import { evaluateOfficerQrAuthority, type OfficerAccessStatus, type OfficerCredentialStatus } from '@/lib/officer-qr-authority';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
type Outcome = 'authority_verified' | 'identity_verified_authority_not_confirmed' | 'verification_failed';
const response = (outcome: Outcome, message: string, details?: unknown, reasons?: string[]) =>
  Response.json({ outcome, message, ...(details ? { details } : {}), ...(reasons?.length ? { reasons } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
const normalize = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

async function logOutcome(tokenId: string | null, assignmentId: number | null, outcome: Outcome) {
  await getPool().execute(
    'INSERT INTO trutag_inspection_verification_events (token_id, assignment_id, outcome) VALUES (?, ?, ?)',
    [tokenId, assignmentId, outcome],
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === 'string' ? body.token : '';
  const payload = token ? parseInspectionToken(token) : null;
  if (!payload) return response('verification_failed', 'This TruTag verification code is invalid or expired.');

  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT t.token_id, DATE_FORMAT(t.expires_at, '%Y-%m-%d %H:%i:%s') AS expires_at, t.revoked_at,
        a.id AS assignment_id, a.status AS assignment_status, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date,
        a.inspection_type, a.jurisdiction AS assignment_jurisdiction,
        o.id AS officer_id, o.name AS officer_name, o.designation,
        o.status AS officer_status, o.credential_status, o.jurisdiction AS officer_jurisdiction,
        u.is_active AS account_active,
        b.id AS business_id, b.business_name, b.licence_reference, b.category AS business_category,
        b.jurisdiction AS business_jurisdiction
       FROM trutag_inspection_verification_tokens t
       JOIN trutag_inspection_assignments a ON a.id = t.assignment_id
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_food_businesses b ON b.id = a.food_business_id
       JOIN trutag_user_accounts u ON u.id = t.issued_by_account_id AND u.officer_id = o.id AND u.role = 'officer'
       WHERE t.token_hash = ? LIMIT 1`, [hashInspectionToken(token)],
    );
    const row = rows[0];
    if (!row) {
      await logOutcome(null, null, 'verification_failed');
      return response('verification_failed', 'This TruTag verification code is invalid, expired, or revoked.');
    }
    if (!matchesInspectionTokenRecord(payload, {
      token_id: String(row.token_id),
      expires_at: String(row.expires_at),
      revoked_at: row.revoked_at,
    })) {
      await logOutcome(row.token_id, Number(row.assignment_id), 'verification_failed');
      return response('verification_failed', 'This TruTag verification code is invalid, expired, or revoked.');
    }
    if (row.assignment_status !== 'completed') {
      await logOutcome(row.token_id, Number(row.assignment_id), 'verification_failed');
      return response('verification_failed', 'This inspection has not been completed in TruTag records.');
    }

    const officerAuthority = evaluateOfficerQrAuthority(row.officer_status as OfficerAccessStatus, row.credential_status as OfficerCredentialStatus);
    if (officerAuthority.outcome === 'verification_failed') {
      await logOutcome(row.token_id, Number(row.assignment_id), 'verification_failed');
      return response('verification_failed', 'The QR token is authentic, but the officer credential has been revoked. This verification has failed.');
    }

    const jurisdictionMatches = normalize(row.assignment_jurisdiction) === normalize(row.officer_jurisdiction)
      && normalize(row.assignment_jurisdiction) === normalize(row.business_jurisdiction);
    const reasons: string[] = [...officerAuthority.reasons];
    if (Number(row.account_active) !== 1) reasons.push('Officer authority is not currently active.');
    if (!jurisdictionMatches) reasons.push('The officer, assignment, and business jurisdiction records do not match.');

    const outcome: Outcome = reasons.length ? 'identity_verified_authority_not_confirmed' : 'authority_verified';
    const message = reasons.length
      ? 'The signed inspection identity matches TruTag records, but current authority could not be confirmed.'
      : 'The officer, inspection assignment, business, and jurisdiction are confirmed in TruTag records.';
    await logOutcome(row.token_id, Number(row.assignment_id), outcome);
    return response(outcome, message, {
      officer: { name: row.officer_name, designation: row.designation },
      inspection: { assignmentReference: `TT-${String(row.assignment_id).padStart(6, '0')}`, type: row.inspection_type, date: row.inspection_date, jurisdiction: row.assignment_jurisdiction },
      business: { name: row.business_name, licenceReference: row.licence_reference, category: row.business_category },
    }, reasons);
  } catch (error) { return databaseError(error); }
}
