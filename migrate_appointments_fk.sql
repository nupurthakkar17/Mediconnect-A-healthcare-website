-- Migration: add real foreign keys to `appointments`
-- ---------------------------------------------------
-- Run this ONCE if you already created the database from an earlier
-- version of schema.sql (i.e. your `appointments` table currently has a
-- free-text `doctor` VARCHAR column instead of `doctor_id`/`user_id`).
--
-- If you're setting the database up fresh, ignore this file - the
-- current schema.sql already has the fixed version built in.
--
-- Usage:
--   mysql -u root -p health < migrate_appointments_fk.sql

USE health;

-- 1. Add the new columns (nullable for now, so this works even if the
--    table already has rows).
ALTER TABLE appointments
  ADD COLUMN user_id INT NULL AFTER id,
  ADD COLUMN doctor_id INT NULL AFTER user_id;

-- 2. Backfill doctor_id by matching the existing free-text `doctor` name
--    against the doctors table.
UPDATE appointments a
JOIN doctors d ON d.name = a.doctor
SET a.doctor_id = d.id;

-- 3. Safety check: if any appointment couldn't be matched (e.g. a doctor
--    was renamed or removed since the appointment was booked), this will
--    return rows. Inspect and fix them manually before continuing -
--    the next steps will fail on a NOT NULL/foreign key violation
--    otherwise, which is the correct, safe behavior.
SELECT id, doctor, appointment_date, appointment_time
FROM appointments
WHERE doctor_id IS NULL;

-- If the query above returned zero rows, continue. If it returned rows,
-- either add the missing doctor to `doctors` and re-run step 2, or
-- manually set a.doctor_id for those specific rows before proceeding.

-- 4. Make doctor_id required.
ALTER TABLE appointments
  MODIFY COLUMN doctor_id INT NOT NULL;

-- 5. Drop the OLD unique index first - it's still defined on the
--    `doctor` column, so MySQL/MariaDB will refuse to drop that column
--    while any index still references it.
ALTER TABLE appointments
  DROP INDEX unique_slot;

-- 6. Now the free-text column can actually be dropped.
ALTER TABLE appointments
  DROP COLUMN doctor;

-- 7. Add the foreign key constraints.
ALTER TABLE appointments
  ADD CONSTRAINT fk_appointments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_appointments_doctor
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT;

-- 8. Re-add the unique constraint, now on doctor_id instead of the old
--    free-text doctor name.
ALTER TABLE appointments
  ADD UNIQUE KEY unique_slot (doctor_id, appointment_date, appointment_time);

SELECT 'Migration complete.' AS status;