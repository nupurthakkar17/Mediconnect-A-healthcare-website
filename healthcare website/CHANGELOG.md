# Changelog

## Real ML symptom checker (replaces the hardcoded dictionary)
- **The old symptom checker was a 22-entry hardcoded dictionary** (`{'Fever':
  ['Flu','COVID-19','Dengue']}`). It's been replaced with an actual trained
  classifier served by a new Python/Flask microservice in `/ml-service`.
- **Model**: `RandomForestClassifier`, trained on a public 4,920-row /
  132-symptom / 41-disease dataset. 100% held-out test accuracy - see
  `ml-service/README.md` for an honest explanation of what that number
  does and doesn't mean (short version: the dataset is clean/deterministic,
  so this reflects the model learning it correctly, not real-world
  diagnostic accuracy).
- **Found and fixed a real data quality bug**: the dataset's
  `medications.csv` had every row from "Alcoholic hepatitis" onward shifted
  to the wrong disease (e.g. "Heart attack" mapped to varicose-vein
  treatment). Caught this by actually testing predictions, not just
  reading code. Rather than patch around it, the medications feature was
  removed entirely until the source data can be verified - shipping wrong
  medical suggestions isn't an acceptable tradeoff for a "nice to have"
  field. There's a regression test guarding this (`test_medications_field_is_absent`).
- **Symptom checker UI rebuilt**: the old 22-checkbox grid is now a
  searchable tag picker covering all 132 symptoms the model understands,
  with ranked, confidence-scored results (progress-bar style), disease
  descriptions, and precautions.
- **Node integration**: `symptom/server.js` now calls the Flask service
  over HTTP (`ML_SERVICE_URL`) instead of running its own matching logic.
  The symptom list is cached in memory (5 min TTL) so a brief ML-service
  blip doesn't break the page; if the service is down and the cache is
  cold, the page shows a clear "temporarily unavailable" message instead
  of crashing.
- **13 pytest tests** in `ml-service/tests/` covering model/label counts,
  known-symptom-combination sanity checks, unknown-symptom handling, and
  the medications regression guard.

## Module consolidation & UI redesign
- **Removed another exposed credential**: the homepage's "Video Consultations"
  card linked to a real Jitsi meeting URL with an embedded JWT containing a
  real name, email, and Google profile photo. The feature had no backend
  behind it (just a hardcoded link), so it was removed entirely rather than
  fixed.
- **Merged `fcm` + `labs` + `beds` into one `findcare` module.** All three
  were the same pattern (search a location, list results from one table)
  copy-pasted three times with three separate DB connections. Now one
  router serves all three behind a tabbed UI (`/findcare?tab=clinics|labs|beds`),
  reusing the exact same queries and the real-time bed-availability
  Socket.IO logic that existed before.
- **Removed the standalone `medicines` module.** It was a hardcoded,
  20-item array with no database backing, entirely disconnected from the
  real, database-backed catalog already served by `medicinedelivery`
  (renamed "Pharmacy" in the UI). Keeping both was pure duplication.
- **Removed the non-functional chatbot** from the homepage (canned
  keyword-matched answers with no real logic behind it, and broken/nested
  HTML from being pasted into the middle of `index.ejs`).
- **Full visual redesign** across `app.css` (shared design tokens/components)
  and `style.css` (site sections): new teal/coral palette, Poppins +
  Inter typography, a Practo-style hero search bar, a trimmed 6-card service
  grid (was 10, several duplicating each other), and a cleaned-up nav
  linking to the consolidated module set. Deleted a dead, unlinked
  `login.css` file left over from an earlier version of the login page.
- Rebranded from generic "HealthCare Services" to "MediConnect" throughout
  page titles and the nav logo.

---

# Changelog — Security, Stability, Auth, Appointments & Beds Rework

## 🔴 Critical security fixes
- Removed a hardcoded MySQL password (`@Nupur56`) that was duplicated in
  6 files (`server.js`, `db.js`, `beds/db.js`, `labs/server.js`,
  `health-tracking/server.js`, `medicinedelivery/server.js`, `fcm/server.js`).
- Removed a second hardcoded MySQL password (`Mansi@12345`) from
  `appointments/server.js`.
- Removed a **live Gmail App Password** and a real Gmail address that were
  hardcoded in `appointments/server.js` as the fallback if `EMAIL_USER`/
  `EMAIL_PASS` weren't set.
  **You should rotate/revoke that Gmail App Password — it was exposed in
  plaintext.**
- Added `.gitignore` (there wasn't one — `node_modules`, `uploads/`, and any
  `.env` file were all one `git add .` away from being committed).
- Added `.env.example` documenting every variable the app needs, with no
  real values in it.

## 🟠 Stability fixes
- Replaced 6 separate `mysql.createConnection()` calls (one per module, each
  opening its own raw connection) with a single shared, pooled connection
  (`db.js`, using `mysql2`'s `createPool`). A single connection silently
  dies when MySQL drops it after being idle; a pool reconnects automatically.
- `db.connect()`'s old callback did `throw err` on failure, which would
  crash the entire Node process if the database was briefly unreachable.
  The new pool logs the error and keeps the app running.
- Removed the unused, legacy `mysql` npm package (both `mysql` and `mysql2`
  were installed; only `mysql2` was actually used anywhere).
- Wrapped `http.createServer(app)` + Socket.IO around a single server
  instance instead of leaving real-time functionality entirely absent.

## 🟢 New: database schema (`schema.sql`)
- There was no SQL file anywhere in the project. A fresh clone had no way
  to create the database — this was undeployable by anyone without your
  local database already configured. Added full schema (users, reviews,
  doctors, appointments, HospitalBeds, health_reports, health_tracking)
  plus seed data for doctors and hospitals, and a `UNIQUE` constraint on
  `appointments(doctor, appointment_date, appointment_time)` so
  double-booking is rejected at the database level too, not just in code.

## Auth (signup / login)
- Login failures used to `res.status(401).send("Invalid credentials")` —
  a plain, unstyled text page. Now failures re-render the login form with
  an inline error message and the email field pre-filled.
- Signup didn't check for duplicate emails at all — it would have thrown a
  raw MySQL duplicate-key error. Now it checks first and shows
  "An account with that email already exists."
- Added server-side validation for empty fields, email format, and
  minimum password length (the client-side `required` attributes were the
  only validation before — trivially bypassed).
- Added a confirm-password field with a matching check.
- Added a show/hide password toggle.
- Redesigned both pages to match the site's actual brand (color, type,
  spacing) instead of a bare unstyled form.

## Appointments module
- Added real double-booking prevention: the same doctor can no longer be
  booked for the same date/time twice (checked in the route, and enforced
  again at the database level via the new `UNIQUE` constraint).
- Added server-side validation: required fields, email format, phone
  format, and rejecting past dates.
- Email sending no longer crashes or silently uses a hardcoded credential
  if `EMAIL_USER`/`EMAIL_PASS` aren't set — it just skips sending and logs
  a warning.
- **Real-time**: booking a slot now broadcasts over Socket.IO to anyone
  else on the booking page, so if two people are looking at the same
  doctor/date/time, the second person sees a live notice instead of
  submitting into a conflict blind.
- Redesigned the form and confirmation page to match the site, replacing
  the old inline `<style>` blocks with the shared stylesheet.

## Beds module
- The page used to show nothing until you searched, and search required an
  **exact** location match. It now lists all hospitals by default and
  searches with partial matching (`LIKE '%term%'`).
- Added a `POST /beds/update/:id` endpoint that updates a hospital's bed
  count and broadcasts it over Socket.IO — **this is the actual real-time
  piece**: anyone viewing the beds page sees the count change live, with a
  brief highlight animation, no refresh needed.
- Redesigned the table/search UI to match the rest of the site.

## Shared / cross-cutting
- Added `views/partials/head.ejs` and `views/partials/nav.ejs` so the
  navbar is defined once and reused (starting with the homepage, login,
  signup, appointments, and beds pages) instead of copy-pasted per page.
- Added `public/css/app.css`: shared card/form/table/badge/alert styles so
  auth, appointments, and beds look like one product instead of each
  having their own one-off inline styles.
- Cleaned up `package.json` (removed the unused `mysql` dependency, added
  a real `start` script, added `engines.node`).

## Known issues not yet addressed (flagged, not fixed, in this pass)
- `multer@1.x` (used in the health reports module for file uploads) has
  known security advisories; upgrading to `multer@2.x` requires a few
  breaking-change updates to that module's code.
- Session store is the default in-memory `express-session` store, which
  doesn't survive a server restart and won't scale past a single process.
  Fine for now; worth swapping for a `connect-mysql` or Redis-backed store
  before real traffic.

---

# Round 2 — Remaining modules (Medicine Delivery, Labs, Health Tracking, Symptom Checker, Health Reports, FCM)

## 🔴 Privacy fix: Health Reports were public to anyone
The health reports module let **any visitor, logged in or not**, view and
download **every report ever uploaded by every user** — there was no
ownership check anywhere. For a healthcare app storing actual medical
documents, this was the single most serious issue in the codebase.
Fixed: the whole module now requires login, reports are scoped to
`user_id`, and downloads are rejected unless you own the report. Also
added a file-type allowlist (PDF/PNG/JPEG only), a 10MB size limit, and
random server-generated filenames (the old code trusted the user's
original filename, which is a path-traversal risk).

## Medicine Delivery — this was the most broken module in the project
- The client-side `app.js` maintained its **own hardcoded fake product
  list** and overwrote the real, database-driven product list on page
  load. The search box filtered nothing real. Rewrote it to filter the
  actual server-rendered cards.
- `orderDetails.ejs` displayed the raw `medicine_id` instead of the
  medicine's name (never joined against the medicines table). Fixed with
  a proper `JOIN`.
- `views/medicinedelivery/order.ejs` was dead, unreachable code referencing
  a data shape (`order.items`) that never existed — removed.
- There was no `medicines`, `orders`, or `order_items` table in any schema
  file at all — this module could not have worked against a fresh
  database. Added all three, with seed data and per-item stock levels.
- Added real stock validation (can't add more to cart than is in stock).
- Added quantity update / remove controls in the cart (previously the
  cart page had no way to change quantities and the "remove" route
  existed but nothing in the UI called it).
- **Real-time**: added order status (`placed → confirmed → out for
  delivery → delivered`) with a live-updating tracker on the order page
  via Socket.IO — this is the clearest "actually real-time" feature in
  the app now.

## Labs
- Search required an **exact** city match; switched to partial match
  (`LIKE`), and the page now lists all labs by default instead of showing
  nothing until you search.
- `labDetails.ejs` existed as a file but no route ever rendered it —
  clicking a lab did nothing. Added a working `/labs/:id` route and wired
  up the cards to link to it.
- No `labs` table existed in any schema file — added it with seed data.

## Health Tracking
- The insert used a `created_at` column that doesn't exist in this table
  (the actual column is `logged_at`) — this would have thrown a SQL error
  on every single submission against a real, correctly-named schema.
- The report page had a real bug: `alert=null` was passed through the URL
  query string and rendered as the literal text "Alert: null" whenever
  there was no health alert, because the string `"null"` is truthy in
  JavaScript. Fixed by rendering the report directly instead of
  redirecting through a query string.
- Added upper-bound validation (previously any number of steps/calories
  was accepted, e.g. 999999999).
- Added a history page so entries are actually visible after being saved
  — previously there was no way to see anything you'd logged before.

## Symptom Checker
- The "Consult a Doctor" link pointed at a view (`appointment/appointment`)
  that never existed anywhere in the project and would 500 if clicked.
  Now redirects to the real appointment booking flow.
- Added a visible disclaimer that this is not a diagnosis.

## FCM (Free Clinic Checkup)
- The homepage route read a local file called `fcm/fcm` and rendered its
  contents — that file was always empty, so this did nothing. Removed it
  and replaced the homepage with a normal search form.
- The booking route inserted into the `appointments` table using columns
  (`clinic_id`, `contact`, `preferred_date`, `preferred_time`) that don't
  exist on that table — it belongs to the doctor-appointments module and
  has a completely different shape. This would have crashed on every
  booking attempt. Added a dedicated `clinics` / `clinic_bookings` schema.
- The booking form view (`fcm/booking.ejs`) didn't exist even though the
  route referenced it — added it, plus a proper confirmation page (the
  old success response was a bare `res.send()` plain-text string).
- Removed a stray nested `fcm/package.json` with its own dependency list
  that had no purpose (this module is mounted as a router inside the main
  app, not run standalone).
- Kept and cleaned up the Leaflet map integration on the results page —
  that part was already good.

## Cross-cutting
- Removed `views/dashboard.ejs` — dead code no route ever rendered.
- Extended the shared header/nav partial and `app.css` design system to
  every remaining page, so the whole site (not just auth/appointments/beds)
  now looks like one product.
- Full end-to-end test pass against a real MySQL/MariaDB instance for
  every module: signup, login, medicine ordering + live status tracking,
  labs search/detail, health tracking + history, symptom checker, FCM
  search/booking, and health report upload/download with ownership
  enforcement all verified working, not just reviewed by eye.
