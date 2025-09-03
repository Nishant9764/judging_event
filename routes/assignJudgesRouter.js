const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your-email@gmail.com",
    pass: "", // 16 digits app password
  },
});

function generateUsername(name) {
  const base = (name || "judge")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}${suffix}`;
}

function generatePassword() {
  const god = [
    "Krishna",
    "Radha",
    "Jagannath",
    "Prabhupada",
    "Baladev",
    "Subhadra",
  ];
  const godName = god[Math.floor(Math.random() * god.length)];
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  const symbols = "!@#$%^&*";
  const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
  return `${godName}${randomNumber}${randomSymbol}`;
}

// --- Send credentials via email ---
async function sendCredentials(email, username, password) {
  const mailOptions = {
    from: "your-email@gmail.com",
    to: email,
    subject: "Judge Account Credentials",
    html: `
        <h3>Welcome!</h3>
        <p>Your judge account has been created:</p>
        <p><b>Username:</b> ${username}</p>
        <p><b>Password:</b> ${password}</p>
        <p>Please keep this information safe.</p>
      `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Email sent to", email);
  } catch (err) {
    console.error("❌ Email sending failed:", err);
  }
}

router.post("/assign", async (req, res) => {
  const { judgeName, judgeEmail, roomNumber } = req.body;

  if (!judgeName || !judgeEmail || !roomNumber)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    // 1️⃣ Get Room Info
    const [rooms] = await db.query(
      "SELECT id, capacity FROM rooms WHERE room_number = ?",
      [roomNumber]
    );
    if (!rooms.length) return res.status(400).json({ error: "Room not found" });

    const roomId = rooms[0].id;
    const capacity = rooms[0].capacity;

    // 2️⃣ Count assigned judges in room
    const [countRows] = await db.query(
      'SELECT COUNT(*) AS cnt FROM users WHERE role="Judge" AND room_id=?',
      [roomId]
    );
    if (countRows[0].cnt >= capacity)
      return res
        .status(400)
        .json({ error: "Room is full. Assign judge to a different room." });

    // 3️⃣ Check if judge exists
    const [existingUsers] = await db.query(
      "SELECT * FROM users WHERE email=?",
      [judgeEmail]
    );

    if (existingUsers.length) {
      const user = existingUsers[0];

      if (user.role !== "Judge")
        return res
          .status(400)
          .json({ error: "Email belongs to a non-judge user" });

      if (user.room_id === roomId)
        return res
          .status(400)
          .json({ error: "Judge already assigned to this room" });

      if (user.assignment_status === "pending")
        return res.status(400).json({
          error:
            "Judge has a pending assignment in another room. Complete it before reassigning.",
        });

      // ✅ Assign existing judge to this room
      await db.query(
        "UPDATE users SET room_id=?, assigned_at=NOW(), assignment_status='pending' WHERE id=?",
        [roomId, user.id]
      );

      // Insert into history
      await db.query(
        "INSERT INTO judge_assignments_history (user_id, room_id) VALUES (?, ?)",
        [user.id, roomId]
      );

      // Send email with existing credentials (cannot decrypt password, so skip if hashed)
      return res.json({
        success: true,
        message: "Existing judge assigned & history updated",
        credentials: { username: user.name, password: "*****hidden*****" },
      });
    }

    // 4️⃣ Create new judge
    const username = generateUsername(judgeName);
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);

    const [insertRes] = await db.query(
      "INSERT INTO users (name, email, password, role, room_id, assigned_at) VALUES (?,?,?,?,?,NOW())",
      [username, judgeEmail, hash, "Judge", roomId]
    );

    // Insert into history
    await db.query(
      "INSERT INTO judge_assignments_history (user_id, room_id) VALUES (?, ?)",
      [insertRes.insertId, roomId]
    );

    // ======================================
    // 5️⃣ Send credentials via email
    // await sendCredentials(judgeEmail, username, password);
    // ======================================

    // 6️⃣ Return credentials for frontend card display
    return res.json({
      success: true,
      message: "New judge created, assigned & email sent",
      credentials: { username, password },
    });
  } catch (err) {
    console.error("Assign Judge Error:", err);
    return res
      .status(500)
      .json({ error: "Server error while assigning judge" });
  }
});

module.exports = router;
