# Inspection Assignments

The assignment module is available at `/assignments`. It selects registered officers and food businesses, then records inspection type, date, and jurisdiction.

## Database setup

Configure the existing MySQL connection with `.env.local` as described in [Food Business Management](FOOD_BUSINESS_MANAGEMENT.md). Run these migrations in order if they have not already been applied:

1. `db/officers.sql`
2. `db/food-businesses.sql`
3. `db/inspection-assignments.sql`
4. `db/auth-users.sql`
5. `db/inspection-verification-tokens.sql`
6. `db/inspection-verification-token-references.sql` (once, after creating the original token table)

The assignment migration creates only `trutag_inspection_assignments` and adds foreign keys to the existing officer and food business records. It does not modify other tables.

## Validation

`POST /api/assignments` rechecks the officer inside a MySQL transaction. The officer must exist, have `credential_status = 'valid'`, have `status = 'active'`, and the assignment jurisdiction must match the officer's registered jurisdiction after trimming and case normalization. The selected food business must also exist. Invalid assignments are rejected without inserting a row.

Each eligible assignment can receive an inspection-specific signed QR token. The QR contains only a `/verify` URL with an opaque signed reference; names, officer IDs, business details, and addresses are not embedded. The token's SHA-256 reference is stored in `trutag_inspection_verification_tokens` with its assignment and expiration. Administrators can revoke active tokens from the Assignment Register; verification rejects expired or revoked tokens and rechecks current assignment and officer credential state.

`GET /api/assignments?q=...` lists and searches saved assignments.
