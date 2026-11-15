import { auth } from '@/auth';
import { cleanProductImageFilename, detectProductScanImageType, isProductImageView, isProductScanReference, PRODUCT_SCAN_IMAGE_MAX_BYTES, PRODUCT_SCAN_IMAGE_TYPES } from '@/lib/product-scan-image';
import { databaseError, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
const MAX_IMAGES_PER_SCAN = 20;
const MAX_MULTIPART_BYTES = PRODUCT_SCAN_IMAGE_MAX_BYTES + 16 * 1024;

async function activeAdminAccount() {
  const session = await auth();
  if (session?.user.role !== 'admin' || !session.user.id) return null;
  const accountId = Number(session.user.id);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return null;
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM trutag_user_accounts WHERE id = ? AND role = 'admin' AND is_active = 1 LIMIT 1", [accountId],
  );
  return rows.length ? accountId : null;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function readLimitedForm(request: Request): Promise<{ form: FormData | null; tooLarge: boolean }> {
  if (!request.body) return { form: null, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        return { form: null, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch { return { form: null, tooLarge: false }; }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) return { form: null, tooLarge: false };
  const form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData().catch(() => null);
  return { form, tooLarge: false };
}

export async function GET(request: Request) {
  try {
    const accountId = await activeAdminAccount();
    if (!accountId) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
    const scanReference = new URL(request.url).searchParams.get('scan') || '';
    if (!isProductScanReference(scanReference)) return Response.json({ error: 'Invalid product scan reference.' }, { status: 400 });
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, scan_reference AS scanReference, image_view AS view, original_filename AS filename,
        mime_type AS mimeType, byte_size AS byteSize, created_at AS uploadedAt
       FROM trutag_product_scan_images WHERE scan_reference = ? ORDER BY created_at, id`, [scanReference],
    );
    return Response.json({ images: rows.map(row => ({ ...row, id: Number(row.id), byteSize: Number(row.byteSize), url: `/api/admin/product-scanner/images/${row.id}` })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin uploads are not allowed.' }, { status: 403 });
  try {
    const accountId = await activeAdminAccount();
    if (!accountId) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_MULTIPART_BYTES) return Response.json({ error: 'Each image must be 6 MB or smaller.' }, { status: 413 });
    const { form, tooLarge } = await readLimitedForm(request);
    if (tooLarge) return Response.json({ error: 'Each image must be 6 MB or smaller.' }, { status: 413 });
    const scanReference = String(form?.get('scanReference') || '');
    const view = String(form?.get('view') || '');
    const uploaded = form?.get('image');
    if (!isProductScanReference(scanReference)) return Response.json({ error: 'Invalid product scan reference.' }, { status: 400 });
    if (!isProductImageView(view)) return Response.json({ error: 'Choose front, back or side for this image.' }, { status: 400 });
    if (!uploaded || typeof uploaded !== 'object' || !('arrayBuffer' in uploaded) || !('size' in uploaded) || !('type' in uploaded) || !('name' in uploaded)) return Response.json({ error: 'Choose an image to upload.' }, { status: 400 });
    const file = uploaded as File;
    if (!(PRODUCT_SCAN_IMAGE_TYPES as readonly string[]).includes(file.type)) return Response.json({ error: 'Use a JPEG, PNG or WebP image.' }, { status: 415 });
    if (file.size < 1 || file.size > PRODUCT_SCAN_IMAGE_MAX_BYTES) return Response.json({ error: 'Each image must be between 1 byte and 6 MB.' }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedType = detectProductScanImageType(bytes);
    if (!detectedType || detectedType !== file.type) return Response.json({ error: 'The file contents do not match a supported image type.' }, { status: 415 });
    const filename = cleanProductImageFilename(file.name);
    const pool = getPool();
    const [countRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM trutag_product_scan_images WHERE scan_reference = ?', [scanReference],
    );
    if (Number(countRows[0]?.total || 0) >= MAX_IMAGES_PER_SCAN) return Response.json({ error: `A product scan can have up to ${MAX_IMAGES_PER_SCAN} images.` }, { status: 409 });
    const [insert] = await pool.execute<ResultSetHeader>(
      `INSERT INTO trutag_product_scan_images (scan_reference, image_view, original_filename, mime_type, byte_size, image_data, uploaded_by_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [scanReference, view, filename, detectedType, bytes.length, bytes, accountId],
    );
    return Response.json({ image: { id: insert.insertId, scanReference, view, filename, mimeType: detectedType, byteSize: bytes.length, url: `/api/admin/product-scanner/images/${insert.insertId}` } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}
