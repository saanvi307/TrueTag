import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

const outcomes = ['authority_verified', 'identity_verified_authority_not_confirmed', 'verification_failed'] as const;
type Outcome = (typeof outcomes)[number];
const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user.role !== 'admin') return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = (params.get('q') || '').trim().slice(0, 120);
  const requestedOutcome = params.get('outcome') || 'all';
  if (requestedOutcome !== 'all' && !outcomes.includes(requestedOutcome as Outcome)) return Response.json({ error: 'Invalid verification outcome filter.' }, { status: 400 });
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const where: string[] = [];
  const values: (string | number)[] = [];
  if (requestedOutcome !== 'all') { where.push('e.outcome = ?'); values.push(requestedOutcome); }
  if (query) {
    where.push(`(CONCAT('TRUTAG-VER-', LPAD(e.id, 8, '0')) LIKE ?
      OR CAST(COALESCE(e.assignment_id, a.id) AS CHAR) LIKE ?
      OR o.name LIKE ? OR o.officer_id LIKE ? OR b.business_name LIKE ? OR b.licence_reference LIKE ?)`);
    const pattern = `%${query}%`;
    values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const pool = getPool();
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM trutag_inspection_verification_events e
       LEFT JOIN trutag_inspection_assignments a ON a.id = e.assignment_id
       LEFT JOIN trutag_officers o ON o.id = a.officer_id
       LEFT JOIN trutag_food_businesses b ON b.id = a.food_business_id ${filterSql}`,
      values,
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.outcome, e.created_at AS createdAt,
        COALESCE(e.assignment_id, a.id) AS assignmentId,
        o.name AS officerName, o.officer_id AS officerId,
        b.business_name AS businessName, b.licence_reference AS licenceReference
       FROM trutag_inspection_verification_events e
       LEFT JOIN trutag_inspection_assignments a ON a.id = e.assignment_id
       LEFT JOIN trutag_officers o ON o.id = a.officer_id
       LEFT JOIN trutag_food_businesses b ON b.id = a.food_business_id
       ${filterSql}
       ORDER BY e.created_at DESC, e.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      values,
    );
    const total = Number(countRows[0]?.total || 0);
    return Response.json({
      logs: rows.map(row => ({ id: row.id, reference: `TRUTAG-VER-${String(row.id).padStart(8, '0')}`, assignmentId: row.assignmentId, officerName: row.officerName, officerId: row.officerId, businessName: row.businessName, licenceReference: row.licenceReference, timestamp: row.createdAt, outcome: row.outcome })),
      page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}
