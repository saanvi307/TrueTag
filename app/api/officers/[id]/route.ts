import { getPool, databaseError } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

export const runtime = 'nodejs';
type OfficerRow = RowDataPacket & { id: number; officer_id: string; name: string; designation: string; department: string; district: string; jurisdiction: string; credential_status: 'valid' | 'pending' | 'expired' | 'revoked'; status: 'active' | 'suspended' | 'revoked'; created_at: Date; updated_at: Date };
const serialize = (row: OfficerRow) => ({ id: row.id, officerId: row.officer_id, name: row.name, designation: row.designation, department: row.department, district: row.district, jurisdiction: row.jurisdiction, credentialStatus: row.credential_status, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at });
const allowed = ['officerId', 'name', 'designation', 'department', 'district', 'jurisdiction', 'credentialStatus', 'status'] as const;
const columns: Record<(typeof allowed)[number], string> = { officerId: 'officer_id', name: 'name', designation: 'designation', department: 'department', district: 'district', jurisdiction: 'jurisdiction', credentialStatus: 'credential_status', status: 'status' };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let connection: PoolConnection | undefined;
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid officer record.' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const updates: Partial<Record<(typeof allowed)[number], string>> = {};
    for (const field of allowed) if (Object.hasOwn(body, field)) {
      const value = body[field];
      if (typeof value !== 'string' || !value.trim()) return Response.json({ error: `${field} is required.` }, { status: 400 });
      if (field === 'status' && !['active', 'suspended', 'revoked'].includes(value)) return Response.json({ error: 'Invalid officer status.' }, { status: 400 });
      if (field === 'credentialStatus' && !['valid', 'pending', 'expired', 'revoked'].includes(value)) return Response.json({ error: 'Invalid credential status.' }, { status: 400 });
      updates[field] = value.trim();
    }
    if (!Object.keys(updates).length) return Response.json({ error: 'No officer changes were provided.' }, { status: 400 });

    const credentialRevoked = updates.status === 'revoked' || updates.credentialStatus === 'revoked';
    if (credentialRevoked) { updates.status = 'revoked'; updates.credentialStatus = 'revoked'; }
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute<RowDataPacket[]>('SELECT id FROM trutag_officers WHERE id = ? FOR UPDATE', [id]);
    if (!existing.length) { await connection.rollback(); return Response.json({ error: 'Officer not found.' }, { status: 404 }); }

    const fields = Object.keys(updates) as (typeof allowed)[number][];
    await connection.execute<ResultSetHeader>(
      `UPDATE trutag_officers SET ${fields.map(field => `${columns[field]} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(field => updates[field]!), id],
    );
    if (credentialRevoked) {
      await connection.execute<ResultSetHeader>(
        `UPDATE trutag_inspection_verification_tokens t
         JOIN trutag_inspection_assignments a ON a.id = t.assignment_id
         SET t.revoked_at = UTC_TIMESTAMP()
         WHERE a.officer_id = ? AND t.revoked_at IS NULL`, [id],
      );
    }
    const [rows] = await connection.execute<OfficerRow[]>('SELECT * FROM trutag_officers WHERE id = ?', [id]);
    await connection.commit();
    return Response.json({ officer: serialize(rows[0]) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'That Officer ID is already registered.' }, { status: 409 });
    return databaseError(error);
  } finally { connection?.release(); }
}
