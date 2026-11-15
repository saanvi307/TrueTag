import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES_PER_ASSIGNMENT = 40;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof allowedTypes)[number];

function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function officerIdentity() {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId || !session.user.id) return null;
  return { officerId: session.user.officerId, accountId: Number(session.user.id) };
}

function assignmentIdFrom(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await officerIdentity();
  if (!identity) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const assignmentId = assignmentIdFrom((await params).id);
  if (!assignmentId) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  try {
    const [owners] = await getPool().execute<RowDataPacket[]>(
      `SELECT a.id FROM trutag_inspection_assignments a
       JOIN trutag_user_accounts u ON u.officer_id = a.officer_id AND u.role = 'officer'
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? AND u.is_active = 1 LIMIT 1`,
      [assignmentId, identity.officerId, identity.accountId],
    );
    if (!owners.length) return Response.json({ error: 'Inspection assignment not found for this officer.' }, { status: 404 });
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, original_filename AS filename, mime_type AS mimeType, byte_size AS byteSize, created_at AS uploadedAt
       FROM trutag_inspection_evidence WHERE assignment_id = ? ORDER BY created_at, id`, [assignmentId],
    );
    return Response.json({ evidence: rows.map(row => ({ ...row, url: `/api/officer/assignments/${assignmentId}/evidence/${row.id}` })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await officerIdentity();
  if (!identity) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const assignmentId = assignmentIdFrom((await params).id);
  if (!assignmentId) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES + 128 * 1024) return Response.json({ error: 'Each image must be 6 MB or smaller.' }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const uploaded = form?.get('image');
  if (!uploaded || typeof uploaded !== 'object' || !('arrayBuffer' in uploaded) || !('size' in uploaded) || !('type' in uploaded) || !('name' in uploaded)) {
    return Response.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }
  const file = uploaded as File;
  if (!allowedTypes.includes(file.type as ImageType)) return Response.json({ error: 'Use a JPEG, PNG, or WebP image.' }, { status: 415 });
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return Response.json({ error: 'Each image must be between 1 byte and 6 MB.' }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(bytes);
  if (!detectedType || detectedType !== file.type) return Response.json({ error: 'The file contents do not match a supported image type.' }, { status: 415 });
  const filename = file.name.replace(/[\\/\0\r\n]/g, '_').slice(0, 255) || 'inspection-photo';

  try {
    const [assignments] = await getPool().execute<RowDataPacket[]>(
      `SELECT a.status AS assignment_status, o.status AS officer_status, o.credential_status, u.is_active AS account_active
       FROM trutag_inspection_assignments a
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_user_accounts u ON u.officer_id = o.id AND u.role = 'officer'
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? AND u.is_active = 1 LIMIT 1`,
      [assignmentId, identity.officerId, identity.accountId],
    );
    if (!assignments.length) return Response.json({ error: 'Inspection assignment not found for this officer.' }, { status: 404 });
    const assignment = assignments[0];
    if (assignment.assignment_status !== 'scheduled' || assignment.officer_status !== 'active' || assignment.credential_status !== 'valid' || Number(assignment.account_active) !== 1) {
      return Response.json({ error: 'An active officer with a valid credential and scheduled assignment is required to upload evidence.' }, { status: 403 });
    }
    const [countRows] = await getPool().execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM trutag_inspection_evidence WHERE assignment_id = ?', [assignmentId],
    );
    if (Number(countRows[0]?.total || 0) >= MAX_IMAGES_PER_ASSIGNMENT) return Response.json({ error: `An inspection can have up to ${MAX_IMAGES_PER_ASSIGNMENT} images.` }, { status: 409 });
    const [insert] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO trutag_inspection_evidence (assignment_id, original_filename, mime_type, byte_size, image_data, uploaded_by_account_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [assignmentId, filename, detectedType, bytes.length, bytes, identity.accountId],
    );
    return Response.json({ evidence: { id: insert.insertId, filename, mimeType: detectedType, byteSize: bytes.length, url: `/api/officer/assignments/${assignmentId}/evidence/${insert.insertId}` } }, { status: 201 });
  } catch (error) { return databaseError(error); }
}
