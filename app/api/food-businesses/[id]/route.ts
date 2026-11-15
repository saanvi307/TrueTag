import { getPool, databaseError } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
type BusinessRow = RowDataPacket & { id: number; business_name: string; licence_reference: string; category: string; address: string; district: string; jurisdiction: string; created_at: Date; updated_at: Date };
const serialize = (row: BusinessRow) => ({ id: row.id, businessName: row.business_name, licenceReference: row.licence_reference, category: row.category, address: row.address, district: row.district, jurisdiction: row.jurisdiction, createdAt: row.created_at, updatedAt: row.updated_at });
const columns = { businessName: 'business_name', licenceReference: 'licence_reference', category: 'category', address: 'address', district: 'district', jurisdiction: 'jurisdiction' } as const;
type Field = keyof typeof columns;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid business record.' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const updates = (Object.keys(columns) as Field[]).filter(field => Object.hasOwn(body, field));
    if (!updates.length) return Response.json({ error: 'No business changes were provided.' }, { status: 400 });
    for (const field of updates) if (typeof body[field] !== 'string' || !String(body[field]).trim()) return Response.json({ error: `${field} is required.` }, { status: 400 });
    const pool = getPool();
    await pool.execute<ResultSetHeader>(`UPDATE trutag_food_businesses SET ${updates.map(field => `${columns[field]} = ?`).join(', ')} WHERE id = ?`, [...updates.map(field => String(body[field]).trim()), id]);
    const [rows] = await pool.execute<BusinessRow[]>('SELECT * FROM trutag_food_businesses WHERE id = ?', [id]);
    if (!rows.length) return Response.json({ error: 'Food business not found.' }, { status: 404 });
    return Response.json({ business: serialize(rows[0]) });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'That FSSAI licence reference is already registered.' }, { status: 409 });
    return databaseError(error);
  }
}
