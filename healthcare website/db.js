// Shared MySQL connection pool used by every module in the app.
// A pool (instead of a single createConnection per module) automatically
// reconnects when MySQL drops an idle connection, and reuses connections
// under load instead of opening a new TCP connection per query.
//
// All credentials come from environment variables ONLY. There are no
// hardcoded fallback passwords here on purpose - see .env.example for the
// variables you need to set locally, and never commit a real .env file.
require("dotenv").config();
const mysql = require("mysql2");

const requiredVars = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(
    `[db] Warning: missing env vars (${missing.join(", ")}). ` +
      "Copy .env.example to .env and fill in real values."
  );
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "health",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Fail loudly (but don't crash the whole process) if credentials are wrong,
// so it shows up in logs instead of silently failing on the first query.
pool.getConnection((err, connection) => {
  if (err) {
    console.error("[db] Could not connect to MySQL:", err.message);
    return;
  }
  console.log("[db] Connected to MySQL pool.");
  connection.release();
});

// Promise-based wrapper so route handlers can use async/await instead of
// nested callbacks.
const promisePool = pool.promise();

module.exports = pool;
module.exports.promise = promisePool;
