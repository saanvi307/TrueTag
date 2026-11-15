import { auth } from '@/auth';
import { getPool, databaseError } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  try {
    const pool = getPool();
    const [officers] = await pool.execute<RowDataPacket[]>(
      `SELECT o.id, o.officer_id, o.name, o.designation, o.department, o.district, o.jurisdiction, o.credential_status, o.status
       FROM trutag_officers o JOIN trutag_user_accounts u ON u.officer_id = o.id
       WHERE o.id = ? AND u.id = ? AND u.role = 'officer' AND u.is_active = 1 LIMIT 1`, [session.user.officerId, Number(session.user.id)],
    );
    if (!officers.length) return Response.json({ error: 'The officer profile linked to this account could not be found.' }, { status: 404 });
    const officer = officers[0];
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.id, a.inspection_type, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date,
       a.jurisdiction, a.status AS assignment_status, b.business_name, b.licence_reference,
       b.category AS business_category, b.address AS business_address, b.district AS business_district,
       b.jurisdiction AS business_jurisdiction,
       (a.status = 'completed' AND o.status = 'active' AND o.credential_status = 'valid') AS officer_is_eligible
       FROM trutag_inspection_assignments a
       INNER JOIN trutag_officers o ON o.id = a.officer_id
       INNER JOIN trutag_food_businesses b ON b.id = a.food_business_id
       WHERE a.officer_id = ? ORDER BY a.inspection_date DESC, a.id DESC LIMIT 500`, [officer.id],
    );
    return Response.json({
      officer: { id: officer.id, officerId: officer.officer_id, name: officer.name, designation: officer.designation, department: officer.department, district: officer.district, jurisdiction: officer.jurisdiction, credentialStatus: officer.credential_status, status: officer.status },
      assignments: rows.map(row => ({ id: row.id, inspectionType: row.inspection_type, inspectionDate: row.inspection_date, jurisdiction: row.jurisdiction, status: row.assignment_status, businessName: row.business_name, licenceReference: row.licence_reference, businessCategory: row.business_category, businessAddress: row.business_address, businessDistrict: row.business_district, businessJurisdiction: row.business_jurisdiction, canGenerateQr: Boolean(row.officer_is_eligible) })),
    });
  } catch (error) { return databaseError(error); }
}
