import { auth } from '@/auth';
import { getPool, databaseError } from '@/lib/db';
import { createInspectionToken, hashInspectionToken } from '@/lib/inspection-token';
import { buildInspectionVerificationUrl, getConfiguredAppBaseUrl } from '@/lib/inspection-verification-url';
import QRCode from 'qrcode';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

export const runtime = 'nodejs';
const QR_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const { id: rawId } = await params;
  const assignmentId = Number(rawId);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  let verificationBaseUrl: string;
  try { verificationBaseUrl = getConfiguredAppBaseUrl(); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'APP_BASE_URL is invalid.' }, { status: 503 }); }
  let connection: PoolConnection | undefined;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT a.id, a.officer_id, a.food_business_id, a.status AS assignment_status,
        o.status AS officer_status, o.credential_status,
        (SELECT COUNT(*) FROM trutag_inspection_checklist_responses r WHERE r.assignment_id = a.id) AS checklist_count
       FROM trutag_inspection_assignments a JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_user_accounts u ON u.officer_id = o.id
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? AND u.role = 'officer' AND u.is_active = 1 FOR UPDATE`, [assignmentId, session.user.officerId, Number(session.user.id)],
    );
    if (!rows.length) { await connection.rollback(); return Response.json({ error: 'This inspection is not assigned to your officer account.' }, { status: 404 }); }
    const assignment = rows[0];
    if (assignment.assignment_status !== 'completed' || Number(assignment.checklist_count) !== 7 || assignment.officer_status !== 'active' || assignment.credential_status !== 'valid') {
      await connection.rollback(); return Response.json({ error: 'A verification QR is available only after all checklist items are saved and the inspection is completed, while your officer access and digital credential remain valid.' }, { status: 422 });
    }
    const expiresAtMs = Date.now() + QR_VALIDITY_MS;
    const { token, payload } = createInspectionToken({ exp: Math.floor(expiresAtMs / 1000) });
    const tokenHash = hashInspectionToken(token);
    // Keep one current QR per assignment; regenerating one automatically invalidates its predecessor.
    await connection.execute('UPDATE trutag_inspection_verification_tokens SET revoked_at = UTC_TIMESTAMP() WHERE assignment_id = ? AND revoked_at IS NULL', [assignmentId]);
    await connection.execute<ResultSetHeader>(
      'INSERT INTO trutag_inspection_verification_tokens (token_id, token_hash, assignment_id, issued_by_account_id, expires_at) VALUES (?, ?, ?, ?, ?)',
      [payload.jti, tokenHash, assignmentId, Number(session.user.id), new Date(expiresAtMs).toISOString().slice(0, 19).replace('T', ' ')],
    );
    const verificationUrl = buildInspectionVerificationUrl(token, verificationBaseUrl);
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 1, width: 280, color: { dark: '#102746', light: '#ffffff' } });
    await connection.commit();
    return Response.json({ assignmentId, qrDataUrl, expiresAt: new Date(expiresAtMs).toISOString(), tokenId: payload.jti }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith('INSPECTION_TOKEN_SECRET')) return Response.json({ error: error.message }, { status: 503 });
    return databaseError(error);
  } finally { connection?.release(); }
}
