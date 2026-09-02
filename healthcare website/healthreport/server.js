const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Create 'uploads/' directory if it doesn't exist
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// These are medical documents - require login for every route in this
// module. The old version let anyone (logged in or not) see and download
// every report ever uploaded by any user, with no ownership check at all.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}
router.use(requireLogin);

const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Use a random name instead of trusting the user-supplied original
    // filename, which could contain path-traversal characters.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return cb(new Error("Only PDF, PNG, or JPEG files are allowed."));
    }
    cb(null, true);
  },
});

// Route to handle uploading health reports
router.post("/upload", (req, res) => {
  upload.single("report")(req, res, (err) => {
    if (err) {
      return res.status(400).render("healthreport/index", {
        reports: [],
        error: err.message || "Upload failed.",
      });
    }
    if (!req.file) {
      return res.status(400).render("healthreport/index", { reports: [], error: "No file uploaded." });
    }

    const { report_name, report_description } = req.body;

    db.query(
      "INSERT INTO health_reports (user_id, report_name, report_description, report_file) VALUES (?, ?, ?, ?)",
      [req.session.user.id, report_name || req.file.originalname, report_description || "", req.file.filename],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Error uploading report.");
        }
        res.redirect("/healthreports/thankyou");
      }
    );
  });
});

// Route to list only the current user's reports.
router.get("/", (req, res) => {
  db.query(
    "SELECT * FROM health_reports WHERE user_id = ? ORDER BY created_at DESC",
    [req.session.user.id],
    (err, reports) => {
      if (err) {
        console.error(err);
        return res.status(500).render("healthreport/index", { reports: [], error: "Error fetching reports." });
      }
      res.render("healthreport/index", { reports, error: null });
    }
  );
});

// Route to handle downloading a report - only the owner can download it.
router.get("/download/:id", (req, res) => {
  const reportId = req.params.id;

  db.query(
    "SELECT * FROM health_reports WHERE id = ? AND user_id = ?",
    [reportId, req.session.user.id],
    (err, results) => {
      if (err) return res.status(500).send("Error fetching report.");
      if (results.length === 0) return res.status(404).send("Report not found.");

      const report = results[0];
      const filePath = path.join(uploadDir, report.report_file);

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send("File not found.");
        res.download(filePath, report.report_name, (err) => {
          if (err) {
            console.error(err);
            res.status(500).send("Error downloading file.");
          }
        });
      });
    }
  );
});

// Route to show Thank You page
router.get("/thankyou", (req, res) => {
  res.render("healthreport/thankyou");
});

module.exports = router;
