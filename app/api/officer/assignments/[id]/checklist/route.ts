import { auth } from '@/auth';
import { getPool, databaseError } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

export const runtime = 'nodejs';
const checklistItems = [
  'food_storage', 'personal_hygiene', 'sanitation', 'pest_control',
  'water_quality_documentation', 'food_labelling', 'temperature_control',
] as const;
type ChecklistKey = (typeof checklistItems)[number];
type ResponseValue = 'compliant' | 'non_compliant' | 'not_applicable';
const isResponse = (value: unknown): value is ResponseValue => ['compliant', 'non_compliant', 'not_applicable'].includes(String(value));

async function officerSession() {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId || !session.user.id) return null;
  return { officerId: session.user.officerId, accountId: Number(session.user.id) };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await officerSession();
  if (!identity) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const assignmentId = Number((await params).id);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  try {
    const [assignments] = await getPool().execute<RowDataPacket[]>(
      `SELECT a.id, a.inspection_type, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date,
        a.jurisdiction, a.status AS assignment_status, b.business_name, b.licence_reference,
        b.category AS business_category, b.address AS business_address, b.district AS business_district,
        o.status AS officer_status, o.credential_status, u.is_active AS account_active
       FROM trutag_inspection_assignments a
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_user_accounts u ON u.officer_id = o.id AND u.role = 'officer'
       JOIN trutag_food_businesses b ON b.id = a.food_business_id
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? LIMIT 1`, [assignmentId, identity.officerId, identity.accountId],
    );
    if (!assignments.length) return Response.json({ error: 'Inspection assignment not found for this officer.' }, { status: 404 });
    const assignment = assignments[0];
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT checklist_key, response, observation, updated_at FROM trutag_inspection_checklist_responses WHERE assignment_id = ? ORDER BY checklist_key', [assignmentId],
    );
    return Response.json({
      assignment: { id: assignment.id, inspectionType: assignment.inspection_type, inspectionDate: assignment.inspection_date, jurisdiction: assignment.jurisdiction, status: assignment.assignment_status, businessName: assignment.business_name, licenceReference: assignment.licence_reference, businessCategory: assignment.business_category, businessAddress: assignment.business_address, businessDistrict: assignment.business_district },
      canEdit: assignment.assignment_status === 'scheduled' && assignment.officer_status === 'active' && assignment.credential_status === 'valid' && Number(assignment.account_active) === 1,
      responses: rows.map(row => ({ key: row.checklist_key, response: row.response, observation: row.observation || '', updatedAt: row.updated_at })),
      items: checklistItems,
    });
  } catch (error) { return databaseError(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await officerSession();
  if (!identity) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const assignmentId = Number((await params).id);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  const body = await request.json().catch(() => null) as { responses?: unknown; complete?: unknown } | null;
  const responses = body?.responses;
  if (body?.complete !== undefined && typeof body.complete !== 'boolean') return Response.json({ error: 'The completion flag must be true or false.' }, { status: 400 });
  if (!Array.isArray(responses) || responses.length !== checklistItems.length) return Response.json({ error: 'Provide a response for every inspection checklist item.' }, { status: 400 });
  const seen = new Set<string>();
  for (const item of responses) {
    if (!item || typeof item !== 'object') return Response.json({ error: 'Invalid checklist response.' }, { status: 400 });
    const value = item as Record<string, unknown>;
    if (!checklistItems.includes(value.key as ChecklistKey) || seen.has(String(value.key))) return Response.json({ error: 'Checklist items must be unique and recognized.' }, { status: 400 });
    if (!isResponse(value.response)) return Response.json({ error: 'Choose a compliance status for every checklist item.' }, { status: 400 });
    if (value.observation !== undefined && (typeof value.observation !== 'string' || value.observation.length > 5000)) return Response.json({ error: 'Observations must be text under 5,000 characters.' }, { status: 400 });
    seen.add(String(value.key));
  }
  if (seen.size !== checklistItems.length) return Response.json({ error: 'A checklist item is missing.' }, { status: 400 });

  let connection: PoolConnection | undefined;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [assignments] = await connection.execute<RowDataPacket[]>(
      `SELECT a.id, a.status AS assignment_status, o.status AS officer_status, o.credential_status, u.is_active AS account_active
       FROM trutag_inspection_assignments a
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_user_accounts u ON u.officer_id = o.id AND u.role = 'officer'
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? FOR UPDATE`, [assignmentId, identity.officerId, identity.accountId],
    );
    if (!assignments.length) { await connection.rollback(); return Response.json({ error: 'Inspection assignment not found for this officer.' }, { status: 404 }); }
    const assignment = assignments[0];
    if (assignment.assignment_status !== 'scheduled') { await connection.rollback(); return Response.json({ error: 'Only scheduled inspections can be edited.' }, { status: 409 }); }
    if (assignment.officer_status !== 'active' || assignment.credential_status !== 'valid' || Number(assignment.account_active) !== 1) {
      await connection.rollback(); return Response.json({ error: 'An active officer with a valid credential is required to save inspection responses.' }, { status: 403 });
    }
    for (const item of responses) {
      const value = item as { key: ChecklistKey; response: ResponseValue; observation?: string };
      await connection.execute<ResultSetHeader>(
        `INSERT INTO trutag_inspection_checklist_responses (assignment_id, checklist_key, response, observation, responded_by_account_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE response = VALUES(response), observation = VALUES(observation), responded_by_account_id = VALUES(responded_by_account_id)`,
        [assignmentId, value.key, value.response, value.observation?.trim() || null, identity.accountId],
      );
    }
    if (body?.complete === true) {
      await connection.execute('UPDATE trutag_inspection_assignments SET status = \'completed\' WHERE id = ? AND status = \'scheduled\'', [assignmentId]);
    }
    const [saved] = await connection.execute<RowDataPacket[]>(
      'SELECT checklist_key, response, observation, updated_at FROM trutag_inspection_checklist_responses WHERE assignment_id = ? ORDER BY checklist_key', [assignmentId],
    );
    await connection.commit();
    return Response.json({ completed: body?.complete === true, responses: saved.map(row => ({ key: row.checklist_key, response: row.response, observation: row.observation || '', updatedAt: row.updated_at })) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    return databaseError(error);
  } finally { connection?.release(); }
}
