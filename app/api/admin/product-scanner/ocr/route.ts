import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import { MAX_PRODUCT_OCR_IMAGES, recognizeProductLabelImages } from '@/lib/product-label-ocr';
import { isProductScanReference, type ProductImageView } from '@/lib/product-scan-image';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  try { if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 }); }
  catch { return Response.json({ error: 'Invalid request origin.' }, { status: 403 }); }

  const session = await auth();
  if (session?.user.role !== 'admin' || !session.user.id) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
  const accountId = Number(session.user.id);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2048) return Response.json({ error: 'Invalid OCR request.' }, { status: 413 });
  const body = await request.json().catch(() => null) as { scanReference?: unknown } | null;
  const scanReference = typeof body?.scanReference === 'string' ? body.scanReference : '';
  if (!isProductScanReference(scanReference)) return Response.json({ error: 'Invalid product scan reference.' }, { status: 400 });

  try {
    const pool = getPool();
    const [accounts] = await pool.execute<RowDataPacket[]>("SELECT id FROM trutag_user_accounts WHERE id = ? AND role = 'admin' AND is_active = 1 LIMIT 1", [accountId]);
    if (!accounts.length) return Response.json({ error: 'Administrator account is inactive.' }, { status: 403 });
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, image_view AS view, original_filename AS filename, image_data AS imageData
       FROM trutag_product_scan_images WHERE scan_reference = ? ORDER BY created_at, id LIMIT ${MAX_PRODUCT_OCR_IMAGES + 1}`,
      [scanReference],
    );
    if (!rows.length) return Response.json({ error: 'No saved images were found for this product scan. Upload images before running OCR.' }, { status: 404 });
    if (rows.length > MAX_PRODUCT_OCR_IMAGES) return Response.json({ error: `This product scan has more than ${MAX_PRODUCT_OCR_IMAGES} images. Start a new scan or remove images before OCR.` }, { status: 413 });
    const images = rows.map(row => ({
      id: Number(row.id), view: row.view as ProductImageView, filename: String(row.filename), imageData: row.imageData as Buffer,
    }));
    const result = await recognizeProductLabelImages(images, scanReference);
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Failed to fetch') || error.message.includes('traineddata') || error.message.includes('fetch failed'))) {
      return Response.json({ error: 'The OCR engine could not load its English language data. Check the bundled model installation or configure TESSERACT_LANG_PATH.' }, { status: 503 });
    }
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code.startsWith('ER_') || (error instanceof Error && error.message.startsWith('Database is not configured.'))) return databaseError(error);
    return Response.json({ error: 'OCR processing failed. Check image readability and the server OCR configuration.' }, { status: 503 });
  }
}
