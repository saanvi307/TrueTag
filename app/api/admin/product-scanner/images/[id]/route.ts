import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

async function activeAdmin() {
  const session = await auth();
  if (session?.user.role !== 'admin' || !session.user.id) return null;
  const id = Number(session.user.id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [rows] = await getPool().execute<RowDataPacket[]>("SELECT id FROM trutag_user_accounts WHERE id = ? AND role = 'admin' AND is_active = 1 LIMIT 1", [id]);
  return rows.length ? id : null;
}

function imageId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await activeAdmin()) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
    const id = imageId((await params).id);
    if (!id) return Response.json({ error: 'Invalid product image reference.' }, { status: 400 });
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT mime_type, image_data FROM trutag_product_scan_images WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Product image not found.' }, { status: 404 });
    return new Response(new Uint8Array(rows[0].image_data as Buffer), { headers: { 'Content-Type': rows[0].mime_type, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch (error) { return databaseError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin');
  try { if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 }); }
  catch { return Response.json({ error: 'Invalid request origin.' }, { status: 403 }); }
  try {
    if (!await activeAdmin()) return Response.json({ error: 'Administrator sign in required.' }, { status: 401 });
    const id = imageId((await params).id);
    if (!id) return Response.json({ error: 'Invalid product image reference.' }, { status: 400 });
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM trutag_product_scan_images WHERE id = ?', [id]);
    if (!result.affectedRows) return Response.json({ error: 'Product image not found.' }, { status: 404 });
    return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return databaseError(error); }
}
