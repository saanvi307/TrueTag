import { getPool, databaseError } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

type BusinessRow = RowDataPacket & {
  id: number; business_name: string; licence_reference: string; category: string;
  address: string; district: string; jurisdiction: string; created_at: Date; updated_at: Date;
};

const serialize = (row: BusinessRow) => ({
  id: row.id, businessName: row.business_name, licenceReference: row.licence_reference,
  category: row.category, address: row.address, district: row.district,
  jurisdiction: row.jurisdiction, createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function GET(request: Request) {
  try {
    const pool = getPool();
    const q = new URL(request.url).searchParams.get('q')?.trim();
    const where = q ? 'WHERE business_name LIKE ? OR licence_reference LIKE ? OR category LIKE ? OR address LIKE ? OR district LIKE ? OR jurisdiction LIKE ?' : '';
    const params = q ? Array.from({ length: 6 }, () => `%${q}%`) : [];
    const [rows] = await pool.execute<BusinessRow[]>(`SELECT id, business_name, licence_reference, category, address, district, jurisdiction, created_at, updated_at FROM trutag_food_businesses ${where} ORDER BY updated_at DESC, id DESC LIMIT 500`, params);
    const [counts] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM trutag_food_businesses');
    return Response.json({ businesses: rows.map(serialize), total: Number(counts[0]?.total || 0) });
  } catch (error) { return databaseError(error); }
}

const fields = ['businessName', 'licenceReference', 'category', 'address', 'district', 'jurisdiction'] as const;
function validate(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const field of fields) if (typeof body[field] !== 'string' || !body[field].trim()) errors[field] = 'This field is required.';
  return errors;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const errors = validate(body);
    if (Object.keys(errors).length) return Response.json({ error: 'Check the required fields.', fields: errors }, { status: 400 });
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO trutag_food_businesses (business_name, licence_reference, category, address, district, jurisdiction) VALUES (?, ?, ?, ?, ?, ?)',
      [String(body.businessName).trim(), String(body.licenceReference).trim(), String(body.category).trim(), String(body.address).trim(), String(body.district).trim(), String(body.jurisdiction).trim()],
    );
    const [rows] = await pool.execute<BusinessRow[]>('SELECT * FROM trutag_food_businesses WHERE id = ?', [result.insertId]);
    return Response.json({ business: serialize(rows[0]) }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'That FSSAI licence reference is already registered.', fields: { licenceReference: 'Licence reference must be unique.' } }, { status: 409 });
    return databaseError(error);
  }
}
