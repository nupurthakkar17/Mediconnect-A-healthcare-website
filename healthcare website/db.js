require("dotenv").config();

const fs = require("fs");
const mysql = require("mysql2");

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 24600,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000,
};

if (process.env.DB_SSL_CA) {
  poolConfig.ssl = {
    ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n"),
    rejectUnauthorized: true,
  };
} else if (process.env.DB_SSL_CA_FILE) {
  poolConfig.ssl = {
    ca: fs.readFileSync(process.env.DB_SSL_CA_FILE, "utf8"),
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool(poolConfig);

pool.getConnection((err, connection) => {
  if (err) {
    console.error("[db] Could not connect to MySQL:", err.message);
    return;
  }

  console.log("[db] Connected to MySQL pool.");
  connection.release();
});

const promisePool = pool.promise();

module.exports = pool;
module.exports.promise = promisePool;