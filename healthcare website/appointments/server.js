const express = require("express");
const router = express.Router();
const { Resend } = require("resend");
require("dotenv").config();

// Reuse the shared pooled connection.
const db = require("../db");
const { generateSlots } = require("./slots");

// Configure Resend for email functionality.
// If RESEND_API_KEY is not set, email sending is skipped
// instead of crashing the application.
const emailConfigured = Boolean(process.env.RESEND_API_KEY);

const resend = emailConfigured
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!emailConfigured) {
  console.warn(
    "[appointments] RESEND_API_KEY not set - confirmation emails will be skipped."
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function renderFormWithError(req, res, values, error) {
  db.query("SELECT * FROM doctors", (err, doctors) => {
    if (err) {
      console.error("Error fetching doctors:", err.message);

      return res.status(500).render("appointments/book-appointment", {
        doctors: [],
        ...values,
        minDate: todayISO(),
        allSlots: generateSlots(),
        error:
          "We couldn't load the doctor list right now. Please try again shortly.",
      });
    }

    res.render("appointments/book-appointment", {
      doctors,
      ...values,
      minDate: todayISO(),
      allSlots: generateSlots(),
      error,
    });
  });
}

// Given a doctor + date, return the fixed clinic slots and which of them
// are already taken.
router.get("/available-slots", (req, res) => {
  const { doctor_id, date } = req.query;

  if (!doctor_id || !date) {
    return res.status(400).json({
      error: "doctor_id and date are required.",
    });
  }

  db.query(
    "SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ?",
    [doctor_id, date],
    (err, rows) => {
      if (err) {
        console.error("Error fetching booked slots:", err.message);

        return res.status(500).json({
          error: "Could not load availability.",
        });
      }

      // MySQL TIME columns come back as "HH:MM:SS".
      const booked = rows.map((r) =>
        String(r.appointment_time).slice(0, 5)
      );

      res.json({
        slots: generateSlots(),
        booked,
      });
    }
  );
});

// Redirect `/appointments` to `/appointments/book-appointment`
router.get("/", (req, res) => {
  res.redirect("/appointments/book-appointment");
});

// Serve the Book Appointment Form
router.get("/book-appointment", (req, res) => {
  renderFormWithError(
    req,
    res,
    {
      name: req.session.user ? req.session.user.name : "",
      email: "",
      phone: "",
      doctor: "",
      selectedDoctor: "",
      appointment_date: "",
      appointment_time: "",
      symptoms: "",
    },
    null
  );
});

// Handle Appointment Booking
router.post("/book-appointment", (req, res) => {
  const {
    doctor_id,
    name,
    email,
    phone,
    appointment_date,
    appointment_time,
    symptoms,
  } = req.body;

  const values = {
    name,
    email,
    phone,
    doctor: doctor_id,
    selectedDoctor: doctor_id || "",
    appointment_date,
    appointment_time,
    symptoms,
  };

  // Server-side validation
  if (
    !doctor_id ||
    !name ||
    !email ||
    !phone ||
    !appointment_date ||
    !appointment_time ||
    !symptoms
  ) {
    return renderFormWithError(
      req,
      res,
      values,
      "All fields are required."
    );
  }

  if (!EMAIL_RE.test(email)) {
    return renderFormWithError(
      req,
      res,
      values,
      "Please enter a valid email address."
    );
  }

  if (!PHONE_RE.test(phone)) {
    return renderFormWithError(
      req,
      res,
      values,
      "Please enter a valid phone number."
    );
  }

  if (appointment_date < todayISO()) {
    return renderFormWithError(
      req,
      res,
      values,
      "Appointment date can't be in the past."
    );
  }

  const validSlotValues = generateSlots().map((s) => s.value);

  if (!validSlotValues.includes(appointment_time)) {
    return renderFormWithError(
      req,
      res,
      values,
      "Please select a valid appointment slot."
    );
  }

  // Prevent double-booking the same doctor at the same date/time.
  db.query(
    "SELECT a.id, d.name AS doctor_name FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.appointment_time = ?",
    [doctor_id, appointment_date, appointment_time],
    (err, existing) => {
      if (err) {
        console.error(
          "Error checking existing appointments:",
          err.message
        );

        return renderFormWithError(
          req,
          res,
          values,
          "Something went wrong. Please try again."
        );
      }

      if (existing.length > 0) {
        return renderFormWithError(
          req,
          res,
          values,
          `${existing[0].doctor_name} is already booked at ${appointment_time} on ${appointment_date}. Please pick another slot.`
        );
      }

      // A logged-in patient is linked via user_id.
      // Guest bookings leave user_id NULL.
      const userId = req.session.user
        ? req.session.user.id
        : null;

      // Save appointment to the database.
      db.query(
        "INSERT INTO appointments (user_id, doctor_id, name, email, phone, appointment_date, appointment_time, symptoms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          doctor_id,
          name,
          email,
          phone,
          appointment_date,
          appointment_time,
          symptoms,
        ],
        (err, result) => {
          if (err) {
            console.error(
              "Error booking appointment:",
              err.message
            );

            return renderFormWithError(
              req,
              res,
              values,
              "Error booking appointment. Please try again."
            );
          }

          console.log("Appointment booked successfully.");

          // Look up the doctor's name for the confirmation email/socket.
          db.query(
            "SELECT name FROM doctors WHERE id = ?",
            [doctor_id],
            async (dErr, docRows) => {
              const doctorName =
                !dErr && docRows.length > 0
                  ? docRows[0].name
                  : "your doctor";

              // Broadcast the new booking in real time.
              const io = req.app.get("io");

              if (io) {
                io.to("appointments-room").emit(
                  "appointment:new",
                  {
                    id: result.insertId,
                    doctor: doctorName,
                    doctor_id: doctor_id,
                    name,
                    appointment_date,
                    appointment_time,
                  }
                );
              }

              // Send confirmation email using Resend HTTPS API.
              if (resend) {
                try {
                  const { data, error } =
                    await resend.emails.send({
                      from: "MediConnect <onboarding@resend.dev>",
                      to: [email],
                      subject: "Appointment Confirmation",
                      html: `
                        <h2>Appointment Confirmation</h2>

                        <p>Dear ${name},</p>

                        <p>
                          Your appointment has been successfully booked
                          with ${doctorName}.
                        </p>

                        <ul>
                          <li>
                            <strong>Date:</strong>
                            ${appointment_date}
                          </li>

                          <li>
                            <strong>Time:</strong>
                            ${appointment_time}
                          </li>

                          <li>
                            <strong>Symptoms:</strong>
                            ${symptoms}
                          </li>
                        </ul>

                        <p>
                          Thank you for choosing our service!
                        </p>
                      `,
                    });

                  if (error) {
                    console.error(
                      "Error sending email:",
                      error
                    );
                  } else {
                    console.log(
                      "Email sent successfully:",
                      data
                    );
                  }
                } catch (emailError) {
                  console.error(
                    "Error sending email:",
                    emailError.message
                  );
                }
              }

              // Email failure does NOT prevent successful booking.
              res.redirect(
                "/appointments/book-appointment-success"
              );
            }
          );
        }
      );
    }
  );
});

// Serve Appointment Success Page
router.get("/book-appointment-success", (req, res) => {
  res.render("appointments/book-appointment-success");
});

// Export the router
module.exports = router;