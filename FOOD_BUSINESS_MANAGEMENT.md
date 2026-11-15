# Food Business Management

The module is available at `/food-businesses`. It registers and edits simulated food business records and stores them in the configured TruTag MySQL database.

## Database setup

1. Copy `.env.example` to `.env.local` and configure the existing MySQL connection.
2. Run `db/food-businesses.sql` against the configured database. This creates only the `trutag_food_businesses` table if it does not exist; it does not change the officer table or other database tables.
3. Start the app with `npm run dev` and open `/food-businesses`.

The configured database user needs `SELECT`, `INSERT`, and `UPDATE` access to `trutag_food_businesses`. Licence references are unique. No database credentials were available in the workspace, so the running app will show a connection setup message until deployment credentials are configured.

## API

- `GET /api/food-businesses?q=...` lists records and searches business name, licence reference, category, address, district, and jurisdiction.
- `POST /api/food-businesses` registers a record.
- `PATCH /api/food-businesses/:id` edits a record.

Records remain in the database and are not deleted by this module.
