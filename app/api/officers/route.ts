import { getPool, databaseError } from '@/lib/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export const runtime = 'nodejs';

type OfficerRow = RowDataPacket & {
  id: number; officer_id: string; name: string; designation: string; department: string;
  district: string; jurisdiction: string; credential_status: 'valid' | 'pending' | 'expired' | 'revoked';
  status: 'active' | 'suspended' | 'revoked'; created_at: Date; updated_at: Date;
};

const serialize = (row: OfficerRow) => ({
  id: row.id, officerId: row.officer_id, name: row.name, designation: row.designation,
  department: row.department, district: row.district, jurisdiction: row.jurisdiction,
  credentialStatus: row.credential_status, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function GET(request: Request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const status = searchParams.get('status');
    const where: string[] = [];
    const params: string[] = [];
    if (q) {
      where.push('(officer_id LIKE ? OR name LIKE ? OR designation LIKE ? OR department LIKE ? OR district LIKE ? OR jurisdiction LIKE ?)');
      params.push(...Array.from({ length: 6 }, () => `%${q}%`));
    }
    if (status && ['active', 'suspended', 'revoked'].includes(status)) {
      where.push('status = ?'); params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute<OfficerRow[]>(`SELECT id, officer_id, name, designation, department, district, jurisdiction, credential_status, status, created_at, updated_at FROM trutag_officers ${clause} ORDER BY updated_at DESC, id DESC LIMIT 500`, params);
    const [counts] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'suspended') AS suspended, SUM(status = 'revoked') AS revoked FROM trutag_officers`);
    return Response.json({ officers: rows.map(serialize), summary: counts[0] });
  } catch (error) { return databaseError(error); }
}

const fields = ['officerId', 'name', 'designation', 'department', 'district', 'jurisdiction', 'credentialStatus'] as const;
function validate(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const field of fields) if (typeof body[field] !== 'string' || !body[field].trim()) errors[field] = 'This field is required.';
  if (typeof body.credentialStatus === 'string' && !['valid', 'pending', 'expired', 'revoked'].includes(body.credentialStatus)) errors.credentialStatus = 'Choose a valid credential status.';
  if (typeof body.status === 'string' && !['active', 'suspended', 'revoked'].includes(body.status)) errors.status = 'Choose a valid officer status.';
  return errors;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const errors = validate(body);
    if (Object.keys(errors).length) return Response.json({ error: 'Check the highlighted fields.', fields: errors }, { status: 400 });
    const pool = getPool();
    const officerStatus = body.status === 'revoked' || body.credentialStatus === 'revoked' ? 'revoked' : String(body.status || 'active');
    const credentialStatus = officerStatus === 'revoked' ? 'revoked' : String(body.credentialStatus);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO trutag_officers (officer_id, name, designation, department, district, jurisdiction, credential_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(body.officerId).trim(), String(body.name).trim(), String(body.designation).trim(), String(body.department).trim(), String(body.district).trim(), String(body.jurisdiction).trim(), credentialStatus, officerStatus],
    );
    const [rows] = await pool.execute<OfficerRow[]>('SELECT * FROM trutag_officers WHERE id = ?', [result.insertId]);
    return Response.json({ officer: serialize(rows[0]) }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'That Officer ID is already registered.', fields: { officerId: 'Officer ID must be unique.' } }, { status: 409 });
    return databaseError(error);
  }
}
