# TruTag MySQL setup

This project uses **MySQL through `mysql2/promise`** in `lib/db.ts`. It does not use an ORM. The application reads `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`; `MYSQL_SSL` enables TLS when set to `true`. The app does not create a database or run migrations automatically.

## Existing schema

The schema files are already in `db/`. They create these application tables:

| Table | Purpose |
| --- | --- |
| `trutag_officers` | Officer identity, jurisdiction, status, and credential status |
| `trutag_food_businesses` | Business name, licence reference, category, location, and jurisdiction |
| `trutag_inspection_assignments` | Joins one officer to one food business for an inspection |
| `trutag_user_accounts` | Admin/officer sign-in accounts; officer accounts link to an officer row |
| `trutag_inspection_verification_tokens` | QR token hash, expiry, revocation, assignment, and issuer account |
| `trutag_inspection_verification_events` | Verification outcome and time; does not store the QR token |
| `trutag_inspection_checklist_responses` | Checklist response, observation, assignment, and responding account |
| `trutag_inspection_evidence` | Private image bytes and metadata linked to an assignment and uploader |
| `trutag_product_scan_images` | Private product label images grouped by scan reference, view, and uploader |

Foreign keys preserve these links: assignments point to officers and food businesses; officer accounts point to officers; QR tokens point to assignments and issuing accounts; verification events point to token references and assignments; checklist responses and evidence point to assignments and user accounts; product scan images point to the uploading user account. The token-reference migration adds the unique `token_id` column needed by verification events.

`db/officer-credential-revocation.sql` updates officer status and revokes tokens; it does not create a table. The other SQL files create tables with `IF NOT EXISTS`. `db/inspection-verification-token-references.sql` contains one-time `ALTER TABLE` statements and must only be run when the `token_id` migration has not already been applied.

## Step 1: Check your existing settings

The project already has a `.env.local`. Keep its generated authentication secrets. Do not replace the file. Open it only if you need to review or correct the MySQL values:

```sh
cd /Users/saanvimohla/Documents/Codex/2026-11-14/build-the-fssai-government-admin-dashboard
nano .env.local
```

The required database values are `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`. Get them from the MySQL administrator or hosting provider. `MYSQL_PORT` defaults to `3306`; use the port your provider gives you. Set `MYSQL_SSL=true` only if the server requires TLS. Do not copy the placeholder values from `.env.example` into `.env.local` as real credentials.

Save in nano with **Ctrl+O**, press **Enter**, then exit with **Ctrl+X**. This edits the existing file; it does not replace the generated Auth.js or QR secrets unless you change those lines yourself.

## Step 2: Test the connection

Run this command from the project folder:

```sh
npm run db:check
```

It loads `.env.local`, performs a read-only `SELECT 1`, then checks the required TruTag tables, columns, and foreign-key relationships. It never prints passwords. A successful network connection with missing tables is reported separately from a failed connection.

If it reports `ENOTFOUND`, verify that `MYSQL_HOST` is the exact hostname from your provider. If it reports `ECONNREFUSED`, verify that MySQL is running and that the port is reachable. If it reports access denied, verify the username, password, and database grants. If it reports a missing database, check `MYSQL_DATABASE` with your provider. Do not continue to schema files until the connection itself succeeds.

## Step 3: Check existing tables before migrations

If `db:check` can connect but reports a missing schema, first inspect the selected database. Replace the angle-bracket values with the values from your `.env.local`; MySQL will ask for the password securely:

```sh
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>"
```

At the `mysql>` prompt, run:

```sql
SELECT DATABASE();
SHOW TABLES;
```

Exit with:

```sql
exit
```

Do not run a one-time `ALTER TABLE` file if the column or index it adds is already present. The checker reports required columns and relationships to help identify which schema parts are absent.

## Step 4: Apply only the missing schema files

Run the SQL files against the database named by `MYSQL_DATABASE`, in this order. Replace the angle-bracket values with your actual host, port, and database username. `-p` prompts for the MySQL password; do not put the password directly in the command.

```sh
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/officers.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/food-businesses.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-assignments.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/auth-users.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-verification-tokens.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-verification-token-references.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/officer-credential-revocation.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-verification-events.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-checklist.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/inspection-evidence.sql
mysql --host="<MYSQL_HOST>" --port="<MYSQL_PORT>" --user="<MYSQL_USER>" -p "<MYSQL_DATABASE>" < db/product-scan-images.sql
```

Those commands show the complete order for a new, empty TruTag schema. For an existing or partly migrated database, skip tables already present and skip the token-reference file if its `token_id` column/index already exists. Keep the same order for any files you do need. These files are schema migrations, not sample-data loaders; they do not create demo officers or businesses.

The account used for migrations needs permission to create and alter tables. The application also uses `MYSQL_USER` for normal reads and writes. If your organization separates migration and application accounts, apply the SQL with its authorized migration account and configure `MYSQL_USER` with the runtime account.

## Step 5: Create the initial administrator securely

After the schema check succeeds, run this one-time interactive command:

```sh
npm run auth:seed-admin
```

It defaults the username to `Saanvi` (you can enter another username), asks for a new password twice without displaying it, and stores only a bcrypt password hash. It refuses to add an initial account if any admin account already exists. Keep the password private and store it in your password manager. This command does not change `.env.local` or any existing database rows.

If an administrator account already exists, do not use the initial seeder. Use the project's approved account recovery process. For adding a separate authorized account, `npm run auth:create-account` is available to administrators with database access.

## Step 6: Test again

After applying the missing files, run:

```sh
npm run db:check
```

The setup is complete only when it reports both `MySQL connection: OK` and `Schema check: OK`. No database migrations were run by the setup checker.
