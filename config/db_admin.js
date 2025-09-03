// db_admin.js
const mysql = require("mysql2");

// create a promise-based pool
const db = mysql
  .createPool({
    host: "localhost",
    user: "root",
    password: "QWERTY@54321",
    database: "auth_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  .promise(); // ✅ promise wrapper

db.query("SELECT 1")
  .then(() => console.log("✅ DB_ADMIN connected"))
  .catch((err) => {
    console.error("❌ DB_ADMIN connection failed:", err);
    process.exit(1);
  });

module.exports = db;
