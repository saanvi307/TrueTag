# Food Safety Officer Dashboard and Sign-in

The officer portal is at `/officer-dashboard`. It uses a server-side Auth.js credentials provider, an HTTP-only signed session cookie, and a database account linked to one officer record. Officer identity comes from the session; the dashboard does not accept an officer ID from the browser.

## Database and environment setup

Configure the MySQL values in `.env.local`. Generate an Auth.js secret with `npx auth secret` and set a separate random value of at least 32 characters for `INSPECTION_TOKEN_SECRET`. Set `APP_BASE_URL` to the public application origin used in generated QR codes.

Run migrations in order:

1. `db/officers.sql`
2. `db/food-businesses.sql`
3. `db/inspection-assignments.sql`
4. `db/auth-users.sql`
5. `db/inspection-verification-tokens.sql`
6. `db/inspection-verification-token-references.sql`
7. `db/inspection-verification-events.sql`
8. `db/officer-credential-revocation.sql`
9. `db/inspection-checklist.sql`
10. `db/inspection-evidence.sql`

The MySQL user account needs read/write access to the new account and verification-token tables as well as existing officer and assignment tables.

## Create accounts

Install dependencies, then run `npm run auth:create-account` from an interactive terminal. The script creates an admin account or links an officer account to an existing Officer ID. Password input is hidden and passwords are stored using bcrypt. There is no public registration route. After five incorrect passwords, an account is locked for 15 minutes.

Admin users can access the administration pages. Officer users can access `/officer-dashboard` and only see assignments linked to their account. The dashboard requires an officer account; the sign-in form is at `/sign-in`.

## Inspection QR verification

The Complete Inspection action appears after all seven checklist items have been answered and saved. Completed assignments become read-only. An active officer with valid credentials can then generate an inspection-specific QR from the officer dashboard. QR URLs use the configured `APP_BASE_URL` and the public `/verify` page; the signed token stays in the URL fragment so it is not sent in normal HTTP request logs. `APP_BASE_URL` must be set to an origin reachable by the devices that scan the QR (use HTTPS in production; localhost only works on the same computer). Tokens are signed with `INSPECTION_TOKEN_SECRET`, unique, expire 30 days after issuance, and are stored as a token ID plus SHA-256 hash in `trutag_inspection_verification_tokens`. Only one token remains active per assignment; regenerating the QR revokes its predecessor. Administrators can revoke active assignment tokens from the Assignment Register. The public `/verify` page returns authority verified, identity verified with authority unconfirmed, or verification failed after checking signature, stored token reference, expiry, revocation, completed assignment, and live officer, business, and jurisdiction records. Suspensions return identity verified with authority unconfirmed. Revoked credentials fail immediately. It does not expose account usernames, addresses, or internal credential data.

## Digital Inspection Passport

Officers can open the checklist from each assignment on `/officer-dashboard`. It captures Compliant, Non-compliant, or Not applicable responses and optional observations for food storage, personal hygiene, sanitation, pest control, water quality documentation, food labelling, and temperature control. Responses are stored per assignment and checklist item in `trutag_inspection_checklist_responses`. The API derives the officer from the signed-in session, verifies assignment ownership and current account/credential status, and allows edits only while the assignment is scheduled. Completed or otherwise ineligible assignments remain viewable when they belong to the officer.

Officers can also attach JPEG, PNG, and WebP photographs to scheduled assignments. Images are limited to 6 MB each and 40 per assignment. The server validates both the declared MIME type and file signature, stores image bytes and metadata in `trutag_inspection_evidence`, and serves previews through an authenticated officer-owned assignment route; uploads are not stored in a public static directory.

The Download PDF passport action generates a current report from the authenticated officer's assignment, officer and business records, and saved checklist responses. It includes per-item response timestamps and observations, report status, and the IST generation time. The PDF route is private and sends the file as an attachment.

## Government admin dashboard

The administrator overview uses current officer, assignment, business and checklist records for its summary cards, inspection activity, district counts and pending reports. A pending report is a completed inspection assignment with fewer than seven saved checklist responses. QR verification outcomes are recorded in `trutag_inspection_verification_events` without storing QR tokens; outcome charts show these recorded attempts for the selected 7, 30 or 90 day period. Event reporting begins after the verification-events migration is applied.

Administrators can review these records on `/verification-logs`, with search by verification reference, officer or business and filters for authorised, unauthorised/authority-unconfirmed, and failed attempts. Records are paginated from the event table; unverifiable signed scans without an associated inspection remain listed without officer or business details.
