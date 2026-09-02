require("dotenv").config(); // Load environment variables
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (needed on Render/Railway/Heroku-style hosts so
// secure cookies and req.ip work correctly behind a load balancer).
app.set("trust proxy", 1);

// Middleware setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[server] SESSION_SECRET is not set. Using an insecure default - set this in your .env before deploying."
  );
}

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // secure cookies require HTTPS, which is what production deploys use
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// Middleware to make user session available globally in views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Shared, pooled database connection (see db.js) - no hardcoded credentials.
const db = require("./db");

// Make Socket.IO available to route modules via req.app.get("io"), so any
// module can broadcast real-time updates without each module standing up
// its own socket server.
app.set("io", io);

io.on("connection", (socket) => {
  // Any connected client can subscribe to the live appointments feed used
  // by the appointments module.
  socket.on("appointments:subscribe", () => {
    socket.join("appointments-room");
  });
  // ...and the live beds feed used by the beds module.
  socket.on("beds:subscribe", () => {
    socket.join("beds-room");
  });
  // ...and a specific order's live status feed used by medicine delivery.
  socket.on("order:subscribe", (orderId) => {
    if (orderId) socket.join(`order-${orderId}`);
  });
});

// Import modular routers
const medicinedelivery = require("./medicinedelivery/server");
const findcare = require("./findcare/server"); // Unified clinics + labs + beds search (replaces fcm/labs/beds)
const healthreport = require("./healthreport/server"); // Import Health Report router
const healthTracking = require("./health-tracking/server"); // Correctly named Health Tracking router
const appointments = require("./appointments/server"); // Import the appointments router
const symptom = require("./symptom/server");

// Use modular routes
app.use("/medicinedelivery", medicinedelivery);
app.use("/findcare", findcare);
app.use("/healthreports", healthreport); // Use the Health Reports router
app.use("/health-tracking", healthTracking); // Use Health Tracking router
app.use("/appointments", appointments); // Use the Appointments router
app.use("/symptom", symptom);

// Main Home Route
app.get("/", (req, res) => {
  db.query("SELECT * FROM reviews ORDER BY created_at DESC", (err, reviews) => {
    if (err) {
      console.error(err);
      return res.status(500).render("index", { reviews: [] });
    }
    res.render("index", { reviews });
  });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Login Routes
app.get("/login", (req, res) => {
  res.render("login", { error: null, success: req.query.registered ? "Account created. Please log in." : null, email: "" });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).render("login", { error: "Email and password are required.", email, success: null });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).render("login", { error: "Something went wrong. Please try again.", email, success: null });
    }
    if (results.length === 0) {
      return res.status(401).render("login", { error: "Invalid email or password.", email, success: null });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).render("login", { error: "Invalid email or password.", email, success: null });
    }

    // Store user info in session
    req.session.user = { id: user.id, name: user.name };
    res.redirect("/");
  });
});

// Signup Routes
app.get("/signup", (req, res) => res.render("signup", { error: null, name: "", email: "" }));

app.post("/signup", async (req, res) => {
  const { name, email, password, confirm_password } = req.body;

  if (!name || !email || !password || !confirm_password) {
    return res.status(400).render("signup", { error: "All fields are required.", name, email });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).render("signup", { error: "Please enter a valid email address.", name, email });
  }
  if (password.length < 6) {
    return res.status(400).render("signup", { error: "Password must be at least 6 characters.", name, email });
  }
  if (password !== confirm_password) {
    return res.status(400).render("signup", { error: "Passwords don't match.", name, email });
  }

  db.query("SELECT id FROM users WHERE email = ?", [email], async (err, existing) => {
    if (err) {
      console.error(err);
      return res.status(500).render("signup", { error: "Something went wrong. Please try again.", name, email });
    }
    if (existing.length > 0) {
      return res.status(409).render("signup", { error: "An account with that email already exists.", name, email });
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).render("signup", { error: "Error signing up. Please try again.", name, email });
        }
        res.redirect("/login?registered=1");
      }
    );
  });
});

// Logout Route
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Review Routes
app.post("/submit-review", (req, res) => {
  const { review } = req.body;
  if (!review || !review.trim()) {
    return res.redirect("/");
  }
  const userId = req.session.user ? req.session.user.id : null; // Check if the user is logged in
  const userName = req.session.user ? req.session.user.name : "Anonymous"; // If no user, show as anonymous

  db.query(
    "INSERT INTO reviews (name, review_text, user_id, created_at) VALUES (?, ?, ?, NOW())",
    [userName, review.trim(), userId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error submitting review");
      }
      res.redirect("/");
    }
  );
});

// Route Not Found (404) Middleware
app.use((req, res) => {
  res.status(404).send("404 - Page Not Found");
});

// Start the server (use `server`, not `app`, so Socket.IO shares the same
// HTTP server instead of listening on a second port).
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
