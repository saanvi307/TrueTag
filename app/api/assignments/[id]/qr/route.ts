import { auth } from '@/auth';
import { getPool, databaseError } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'admin') return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
  const { id: rawId } = await params;
  const assignmentId = Number(rawId);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  let connection: PoolConnection | undefined;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [assignments] = await connection.execute<RowDataPacket[]>('SELECT id FROM trutag_inspection_assignments WHERE id = ? FOR UPDATE', [assignmentId]);
    if (!assignments.length) { await connection.rollback(); return Response.json({ error: 'Inspection assignment not found.' }, { status: 404 }); }
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE trutag_inspection_verification_tokens SET revoked_at = UTC_TIMESTAMP()
       WHERE assignment_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`, [assignmentId],
    );
    await connection.commit();
    return Response.json({ assignmentId, revokedCount: result.affectedRows });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    return databaseError(error);
  } finally { connection?.release(); }
}
