import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; evidenceId: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId || !session.user.id) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const { id, evidenceId } = await params;
  const assignmentId = Number(id);
  const imageId = Number(evidenceId);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1 || !Number.isSafeInteger(imageId) || imageId < 1) return Response.json({ error: 'Invalid evidence reference.' }, { status: 400 });
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT e.mime_type, e.image_data
       FROM trutag_inspection_evidence e
       JOIN trutag_inspection_assignments a ON a.id = e.assignment_id
       JOIN trutag_user_accounts u ON u.officer_id = a.officer_id AND u.role = 'officer'
       WHERE e.id = ? AND e.assignment_id = ? AND a.officer_id = ? AND u.id = ? AND u.is_active = 1 LIMIT 1`,
      [imageId, assignmentId, session.user.officerId, Number(session.user.id)],
    );
    if (!rows.length) return Response.json({ error: 'Inspection evidence not found.' }, { status: 404 });
    const row = rows[0];
    return new Response(new Uint8Array(row.image_data as Buffer), { headers: { 'Content-Type': row.mime_type, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch (error) { return databaseError(error); }
}
