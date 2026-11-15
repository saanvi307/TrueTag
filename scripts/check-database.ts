import nextEnv from '@next/env';
import { getPool } from '../lib/db.ts';
import type { RowDataPacket } from 'mysql2';

nextEnv.loadEnvConfig(process.cwd());

const requiredColumns: Record<string, string[]> = {
  trutag_officers: ['id', 'officer_id', 'name', 'credential_status', 'status'],
  trutag_food_businesses: ['id', 'business_name', 'licence_reference', 'district', 'jurisdiction'],
  trutag_inspection_assignments: ['id', 'officer_id', 'food_business_id', 'inspection_type', 'inspection_date', 'jurisdiction', 'status'],
  trutag_user_accounts: ['id', 'username', 'password_hash', 'role', 'officer_id', 'is_active'],
  trutag_inspection_verification_tokens: ['id', 'token_id', 'token_hash', 'assignment_id', 'issued_by_account_id', 'expires_at', 'revoked_at'],
  trutag_inspection_verification_events: ['id', 'token_id', 'assignment_id', 'outcome', 'created_at'],
  trutag_inspection_checklist_responses: ['id', 'assignment_id', 'checklist_key', 'response', 'observation', 'responded_by_account_id', 'updated_at'],
  trutag_inspection_evidence: ['id', 'assignment_id', 'original_filename', 'mime_type', 'byte_size', 'image_data', 'uploaded_by_account_id'],
  trutag_product_scan_images: ['id', 'scan_reference', 'image_view', 'original_filename', 'mime_type', 'byte_size', 'image_data', 'uploaded_by_account_id'],
};

const requiredRelationships = [
  ['trutag_inspection_assignments', 'officer_id', 'trutag_officers', 'id'],
  ['trutag_inspection_assignments', 'food_business_id', 'trutag_food_businesses', 'id'],
  ['trutag_user_accounts', 'officer_id', 'trutag_officers', 'id'],
  ['trutag_inspection_verification_tokens', 'assignment_id', 'trutag_inspection_assignments', 'id'],
  ['trutag_inspection_verification_tokens', 'issued_by_account_id', 'trutag_user_accounts', 'id'],
  ['trutag_inspection_verification_events', 'token_id', 'trutag_inspection_verification_tokens', 'token_id'],
  ['trutag_inspection_verification_events', 'assignment_id', 'trutag_inspection_assignments', 'id'],
  ['trutag_inspection_checklist_responses', 'assignment_id', 'trutag_inspection_assignments', 'id'],
  ['trutag_inspection_checklist_responses', 'responded_by_account_id', 'trutag_user_accounts', 'id'],
  ['trutag_inspection_evidence', 'assignment_id', 'trutag_inspection_assignments', 'id'],
  ['trutag_inspection_evidence', 'uploaded_by_account_id', 'trutag_user_accounts', 'id'],
  ['trutag_product_scan_images', 'uploaded_by_account_id', 'trutag_user_accounts', 'id'],
] as const;

let pool: ReturnType<typeof getPool> | undefined;
try {
  pool = getPool();
  await pool.query('SELECT 1 AS connected');
  console.log('MySQL connection: OK.');

  const [columnRows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const [relationshipRows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  const columns = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const table = String(row.TABLE_NAME);
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table)!.add(String(row.COLUMN_NAME));
  }
  let missingSchema = false;
  for (const [table, expected] of Object.entries(requiredColumns)) {
    const present = columns.get(table);
    const missing = present ? expected.filter(column => !present.has(column)) : expected;
    if (missing.length) {
      missingSchema = true;
      console.log(`MISSING ${table}: ${present ? `columns ${missing.join(', ')}` : 'table not found'}`);
    } else console.log(`OK ${table}`);
  }

  const relationshipSet = new Set(relationshipRows.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}`));
  for (const [table, column, referencedTable, referencedColumn] of requiredRelationships) {
    const key = `${table}.${column}->${referencedTable}.${referencedColumn}`;
    if (!relationshipSet.has(key)) {
      missingSchema = true;
      console.log(`MISSING RELATIONSHIP ${key}`);
    }
  }
  if (missingSchema) {
    console.error('Schema check: INCOMPLETE. Review the migration status before applying SQL files; some files contain one-time ALTER TABLE statements.');
    process.exitCode = 1;
  } else console.log('Schema check: OK. Required TruTag tables, columns, and foreign-key relationships are present.');
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (message.startsWith('Database is not configured.')) console.error(message);
  else if (code === 'ER_ACCESS_DENIED_ERROR') console.error('MySQL rejected the configured account. Check MYSQL_USER, MYSQL_PASSWORD, and database grants.');
  else if (code === 'ER_BAD_DB_ERROR') console.error('MYSQL_DATABASE was not found or is not accessible.');
  else if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) console.error(`MySQL is unreachable (${code}). Check MYSQL_HOST and MYSQL_PORT.`);
  else console.error(`Database check failed${code ? ` (${code})` : ''}. No secret values were displayed.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => undefined);
}
