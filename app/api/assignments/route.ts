import { getPool, databaseError } from '@/lib/db';
import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

type AssignmentRow = RowDataPacket & {
  id: number; officer_id: number; food_business_id: number; inspection_type: string;
  inspection_date: string; jurisdiction: string; status: string; created_at: Date;
  officer_name: string; officer_ref: string; credential_status: string; officer_status: string;
  business_name: string; licence_reference: string; active_qr_count: number;
};

const assignmentSelect = `SELECT a.id, a.officer_id, a.food_business_id, a.inspection_type, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date, a.jurisdiction, a.status, a.created_at,
  o.name AS officer_name, o.officer_id AS officer_ref, o.credential_status, o.status AS officer_status,
  b.business_name, b.licence_reference,
  (SELECT COUNT(*) FROM trutag_inspection_verification_tokens t WHERE t.assignment_id = a.id AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()) AS active_qr_count
  FROM trutag_inspection_assignments a
  INNER JOIN trutag_officers o ON o.id = a.officer_id
  INNER JOIN trutag_food_businesses b ON b.id = a.food_business_id`;

const serialize = (row: AssignmentRow) => ({
  id: row.id, officerId: row.officer_id, officerName: row.officer_name, officerReference: row.officer_ref,
  officerCredentialStatus: row.credential_status, officerStatus: row.officer_status,
  foodBusinessId: row.food_business_id, businessName: row.business_name,
  licenceReference: row.licence_reference, inspectionType: row.inspection_type,
  inspectionDate: row.inspection_date,
  jurisdiction: row.jurisdiction, status: row.status, createdAt: row.created_at, hasActiveQr: Number(row.active_qr_count) > 0,
});

export async function GET(request: Request) {
  try {
    const pool = getPool();
    const q = new URL(request.url).searchParams.get('q')?.trim();
    const where = q ? 'WHERE o.name LIKE ? OR o.officer_id LIKE ? OR b.business_name LIKE ? OR b.licence_reference LIKE ? OR a.inspection_type LIKE ? OR a.jurisdiction LIKE ?' : '';
    const params = q ? Array.from({ length: 6 }, () => `%${q}%`) : [];
    const [rows] = await pool.execute<AssignmentRow[]>(`${assignmentSelect} ${where} ORDER BY a.inspection_date DESC, a.id DESC LIMIT 500`, params);
    const [counts] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total, SUM(inspection_date >= CURRENT_DATE AND status = \'scheduled\') AS upcoming FROM trutag_inspection_assignments');
    return Response.json({ assignments: rows.map(serialize), summary: { total: Number(counts[0]?.total || 0), upcoming: Number(counts[0]?.upcoming || 0) } });
  } catch (error) { return databaseError(error); }
}

function isPositiveId(value: unknown): value is number { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function normalizeJurisdiction(value: string) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en'); }
function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export async function POST(request: Request) {
  let connection: PoolConnection | undefined;
  try {
    const body = await request.json() as Record<string, unknown>;
    const errors: Record<string, string> = {};
    if (!isPositiveId(body.officerId)) errors.officerId = 'Select an officer.';
    if (!isPositiveId(body.foodBusinessId)) errors.foodBusinessId = 'Select a food business.';
    if (typeof body.inspectionType !== 'string' || !body.inspectionType.trim()) errors.inspectionType = 'Inspection type is required.';
    if (!isDateOnly(body.inspectionDate)) errors.inspectionDate = 'Choose a valid inspection date.';
    if (typeof body.jurisdiction !== 'string' || !body.jurisdiction.trim()) errors.jurisdiction = 'Jurisdiction is required.';
    if (Object.keys(errors).length) return Response.json({ error: 'Check the assignment details.', fields: errors }, { status: 400 });

    const pool = getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [officers] = await connection.execute<RowDataPacket[]>(`SELECT id, credential_status, status, jurisdiction FROM trutag_officers WHERE id = ? FOR UPDATE`, [Number(body.officerId)]);
    if (!officers.length) { await connection.rollback(); return Response.json({ error: 'The selected officer no longer exists.', fields: { officerId: 'Select an existing officer.' } }, { status: 422 }); }
    const officer = officers[0];
    if (officer.credential_status !== 'valid') { await connection.rollback(); return Response.json({ error: 'This officer cannot be assigned because their credentials are not valid.', fields: { officerId: `Officer credential status is ${officer.credential_status}.` } }, { status: 422 }); }
    if (officer.status !== 'active') { await connection.rollback(); return Response.json({ error: 'This officer cannot be assigned because their access is not active.', fields: { officerId: `Officer status is ${officer.status}.` } }, { status: 422 }); }
    if (normalizeJurisdiction(String(body.jurisdiction)) !== normalizeJurisdiction(String(officer.jurisdiction))) {
      await connection.rollback();
      return Response.json({ error: 'Assignment jurisdiction must match the selected officer’s registered jurisdiction.', fields: { jurisdiction: `Officer jurisdiction: ${officer.jurisdiction}.` } }, { status: 422 });
    }
    const [businesses] = await connection.execute<RowDataPacket[]>('SELECT id FROM trutag_food_businesses WHERE id = ?', [Number(body.foodBusinessId)]);
    if (!businesses.length) { await connection.rollback(); return Response.json({ error: 'The selected food business no longer exists.', fields: { foodBusinessId: 'Select an existing food business.' } }, { status: 422 }); }

    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO trutag_inspection_assignments (officer_id, food_business_id, inspection_type, inspection_date, jurisdiction) VALUES (?, ?, ?, ?, ?)',
      [Number(body.officerId), Number(body.foodBusinessId), String(body.inspectionType).trim(), String(body.inspectionDate), String(body.jurisdiction).trim()],
    );
    const [rows] = await connection.execute<AssignmentRow[]>(`${assignmentSelect} WHERE a.id = ?`, [result.insertId]);
    await connection.commit();
    return Response.json({ assignment: serialize(rows[0]) }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    return databaseError(error);
  } finally { connection?.release(); }
}
