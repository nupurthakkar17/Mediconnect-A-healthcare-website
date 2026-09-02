const express = require("express");
const router = express.Router();

// Reuse the shared pooled connection instead of opening a new one with a
// hardcoded password.
const db = require("../db");

// Serve Health Tracking Form
router.get("/", (req, res) => {
  res.render("health-tracking/health-tracking", { error: null });
});

// Handle Health Tracking Data Submission
router.post("/", (req, res) => {
  const steps = Number(req.body.steps);
  const water = Number(req.body.water);
  const calories = Number(req.body.calories);
  const heart_rate = Number(req.body.heart_rate);
  const userId = req.session.user ? req.session.user.id : null;

  // Validate data (upper bounds too, not just "greater than zero" - the
  // old version accepted anything, e.g. 999999999 steps).
  const valid =
    steps > 0 && steps <= 100000 &&
    water > 0 && water <= 20 &&
    calories > 0 && calories <= 10000 &&
    heart_rate >= 30 && heart_rate <= 220;

  if (!valid) {
    return res.status(400).render("health-tracking/health-tracking", {
      error: "Please enter realistic values (e.g. heart rate between 30-220 bpm).",
    });
  }

  db.query(
    "INSERT INTO health_tracking (user_id, steps, water, calories, heart_rate, logged_at) VALUES (?, ?, ?, ?, ?, NOW())",
    [userId, steps, water, calories, heart_rate],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).render("health-tracking/health-tracking", {
          error: "Something went wrong saving your data. Please try again.",
        });
      }

      let healthAlert = null;
      if (heart_rate < 60) {
        healthAlert = "Low heart rate detected. Consider consulting a doctor.";
      } else if (heart_rate > 100) {
        healthAlert = "High heart rate detected. Consider consulting a doctor.";
      }

      // Render the report directly instead of round-tripping the data
      // through the URL query string (which used to render "Alert: null"
      // whenever there was no alert, since `alert=null` is a truthy string).
      res.render("health-tracking/health-tracking-report", {
        steps, water, calories, heart_rate, alert: healthAlert,
      });
    }
  );
});

// Show past entries (only meaningful once logged in, since entries are
// tied to a user account).
router.get("/history", (req, res) => {
  if (!req.session.user) {
    return res.render("health-tracking/history", { entries: null });
  }
  db.query(
    "SELECT * FROM health_tracking WHERE user_id = ? ORDER BY logged_at DESC LIMIT 30",
    [req.session.user.id],
    (err, entries) => {
      if (err) {
        console.error(err);
        return res.status(500).render("health-tracking/history", { entries: [] });
      }
      res.render("health-tracking/history", { entries });
    }
  );
});

module.exports = router;
