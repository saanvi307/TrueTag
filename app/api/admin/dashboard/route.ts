import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user.role !== 'admin') return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
  const requestedDays = Number(new URL(request.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  const indiaNow = new Date(Date.now() + 330 * 60 * 1000);
  const indiaToday = indiaNow.toISOString().slice(0, 10);
  const cutoff = new Date(`${indiaToday}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  try {
    const pool = getPool();
    const [officerRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
        SUM(status = 'active' AND credential_status = 'valid') AS active,
        SUM(status = 'revoked' OR credential_status = 'revoked') AS revoked
       FROM trutag_officers`,
    );
    const [assignmentRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM trutag_inspection_assignments`,
    );
    const [activityRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(inspection_date, '%Y-%m-%d') AS date, COUNT(*) AS inspections
       FROM trutag_inspection_assignments
       WHERE inspection_date >= ? AND inspection_date <= ? AND status = 'completed'
       GROUP BY inspection_date ORDER BY inspection_date`, [cutoffDate, indiaToday],
    );
    const [verificationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT outcome, COUNT(*) AS total FROM trutag_inspection_verification_events
       WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ${days} DAY GROUP BY outcome`,
    );
    const [districtRows] = await pool.execute<RowDataPacket[]>(
      `SELECT b.district, COUNT(*) AS inspections
       FROM trutag_inspection_assignments a
       JOIN trutag_food_businesses b ON b.id = a.food_business_id
       WHERE a.inspection_date >= ? AND a.inspection_date <= ? AND a.status = 'completed'
       GROUP BY b.district ORDER BY inspections DESC, b.district ASC LIMIT 10`, [cutoffDate, indiaToday],
    );
    const [pendingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.id, a.inspection_type, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date,
        o.name AS officer_name, o.officer_id, b.business_name,
        (SELECT COUNT(*) FROM trutag_inspection_checklist_responses r WHERE r.assignment_id = a.id) AS completed_items
       FROM trutag_inspection_assignments a
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_food_businesses b ON b.id = a.food_business_id
       WHERE a.status = 'completed'
         AND (SELECT COUNT(*) FROM trutag_inspection_checklist_responses r WHERE r.assignment_id = a.id) < 7
       ORDER BY a.inspection_date DESC, a.id DESC LIMIT 8`,
    );
    const [pendingCountRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM trutag_inspection_assignments a
       WHERE a.status = 'completed'
         AND (SELECT COUNT(*) FROM trutag_inspection_checklist_responses r WHERE r.assignment_id = a.id) < 7`,
    );

    const activityByDate = new Map(activityRows.map(row => [String(row.date), Number(row.inspections)]));
    const activity = Array.from({ length: days }, (_, index) => {
      const date = new Date(cutoff);
      date.setUTCDate(cutoff.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, label: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date), inspections: activityByDate.get(key) || 0 };
    });
    const verificationTotals = Object.fromEntries(verificationRows.map(row => [String(row.outcome), Number(row.total)]));
    const verification = [
      { outcome: 'authority_verified', label: 'Authority verified', value: verificationTotals.authority_verified || 0, color: '#21966f' },
      { outcome: 'identity_verified_authority_not_confirmed', label: 'Authority unconfirmed', value: verificationTotals.identity_verified_authority_not_confirmed || 0, color: '#e5a23a' },
      { outcome: 'verification_failed', label: 'Verification failed', value: verificationTotals.verification_failed || 0, color: '#dc6c65' },
    ];
    return Response.json({
      days,
      summary: {
        officers: Number(officerRows[0]?.total || 0),
        activeOfficers: Number(officerRows[0]?.active || 0),
        revokedOfficers: Number(officerRows[0]?.revoked || 0),
        assignments: Number(assignmentRows[0]?.total || 0),
        verificationFailures: verificationTotals.verification_failed || 0,
        pendingReports: Number(pendingCountRows[0]?.total || 0),
      },
      activity,
      verification,
      districts: districtRows.map(row => ({ district: row.district, inspections: Number(row.inspections) })),
      pendingReports: pendingRows.map(row => ({ id: row.id, inspectionType: row.inspection_type, inspectionDate: row.inspection_date, officerName: row.officer_name, officerId: row.officer_id, businessName: row.business_name, completedItems: Number(row.completed_items), totalItems: 7 })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}
