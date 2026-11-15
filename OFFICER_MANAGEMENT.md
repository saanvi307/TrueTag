# Officer Management

Officer records are served by the Next.js Node.js API at `/api/officers` and stored in the configured MySQL database.

Credential status supports valid, pending, expired, and revoked. Suspending an officer leaves the inspection record intact and changes QR verification to identity verified / authority not confirmed. Revoking access sets the credential state to revoked and atomically marks all outstanding QR tokens for the officer as revoked; historical assignment rows are preserved.

## Connect the database

1. Install the application dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the MySQL host, port, application user, password, and existing database name. Set `MYSQL_SSL=true` when the database requires TLS.
3. Run `db/officers.sql` against that database. The migration creates only the `trutag_officers` table if it does not exist; it does not seed simulated records or alter other tables.
4. After the inspection assignment and verification-token tables exist, run `db/officer-credential-revocation.sql` to update existing MySQL schemas and revoke tokens for officers already marked revoked.
5. Start the app with `npm run dev` and open `/officers`.

The database user needs `SELECT`, `INSERT`, and `UPDATE` privileges on `trutag_officers`. Keep `.env.local` out of source control. No database credentials were present in this workspace, so connection setup is environment dependent.

## API

- `GET /api/officers?q=...&status=active` lists and filters records.
- `POST /api/officers` registers an officer.
- `PATCH /api/officers/:id` edits details or changes officer status to active, suspended, or revoked.

Credential status (valid, pending, expired, revoked) is stored separately from officer access status. Revocation updates the officer and their outstanding verification tokens in one transaction; the module does not delete officers or inspection records.
