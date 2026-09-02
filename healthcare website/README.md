# MediConnect

Full-stack healthcare platform: appointments, a symptom checker, a pharmacy
(medicine ordering + live delivery tracking), Find Care (free clinics,
diagnostic labs, and live hospital bed availability in one search), health
tracking, and health report storage.

`fcm`, `labs`, and `beds` used to be three separate modules that each
implemented the same "search a location, render a list" pattern against
their own table. They've been merged into a single `findcare` module with
a tabbed UI, since keeping them separate added duplicate code without
adding distinct value. The standalone `medicines` module (a hardcoded,
non-database product list disconnected from the real pharmacy) was removed
entirely - `medicinedelivery` already serves the real, database-backed
catalog.

## Setup (local)

1. Install dependencies:
   ```
   npm install
   ```
2. Create a MySQL database and load the schema:
   ```
   mysql -u root -p < schema.sql
   ```
3. Copy `.env.example` to `.env` and fill in real values (DB credentials,
   a session secret, and — optionally — Gmail credentials for appointment
   confirmation emails):
   ```
   cp .env.example .env
   ```
4. Start the app:
   ```
   npm start
   ```
   The site runs at http://localhost:3000.

## Deploying

- Set the same variables from `.env.example` as real environment variables
  on your host (Render, Railway, etc.) — don't upload a `.env` file.
- Set `NODE_ENV=production` so session cookies are marked `secure` (requires
  HTTPS, which your host should provide).
- Point `DB_HOST`/`DB_USER`/`DB_PASS`/`DB_NAME` at your managed MySQL
  instance and run `schema.sql` against it once.
- If you want appointment confirmation emails, set `EMAIL_USER` to a Gmail
  address and `EMAIL_PASS` to an **App Password** (not your real password) —
  see the comment in `.env.example` for how to generate one. Without these
  set, the app still works; it just skips sending the email.
- Rotate any credentials that were previously hardcoded in this repo's
  history before making the repo public (see CHANGELOG.md).

## Project structure

Each folder under the project root (`appointments/`, `beds/`, `labs/`, etc.)
is a self-contained Express router mounted onto the main app in `server.js`.
They all share a single pooled MySQL connection from `db.js` and can access
the real-time layer via `req.app.get("io")` (Socket.IO).
