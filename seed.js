// seed.js — Auto-seeds the admin account on first run
require("dotenv").config();
const db = require("./config/db_admin");
const bcrypt = require("bcrypt");

async function seedAdmin() {
  try {
    const [rows] = await db.query(
      "SELECT id FROM users WHERE role = 'Administrator' LIMIT 1"
    );

    if (rows.length > 0) {
      console.log("✅ Admin already exists — skipping seed.");
      return;
    }

    const plainPassword = process.env.ADMIN_PASSWORD || "Admin@ISKCON2025";
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [
        process.env.ADMIN_NAME || "admin",
        process.env.ADMIN_EMAIL || "admin@iskconnrjd.org",
        hashedPassword,
        "Administrator",
      ]
    );

    console.log(
      `✅ Admin seeded successfully! Username: "${process.env.ADMIN_NAME || "admin"}"`
    );
  } catch (err) {
    console.error("❌ Admin seeding failed:", err.message);
  }
}

module.exports = seedAdmin;
