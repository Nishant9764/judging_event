// routes/assignJudgesRouter.js — Production Grade
// FIX: ISKCON-themed password, professional email, single router
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");
const bcrypt = require("bcrypt");
const {
  generatePassword,
  sendJudgeCredentials,
} = require("../services/emailService");

function requireAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.role === "Administrator"
  )
    return next();
  return res.status(403).json({ success: false, error: "Admins only." });
}

// POST /assign
router.post("/assign", requireAdmin, async (req, res) => {
  const { judgeName, judgeEmail, roomNumber } = req.body;

  if (!judgeName || !judgeEmail || !roomNumber) {
    return res
      .status(400)
      .json({ success: false, error: "All fields are required." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock room row — prevents race conditions
    const [[room]] = await conn.query(
      "SELECT id, event_name, capacity FROM rooms WHERE room_number = ? FOR UPDATE",
      [roomNumber.trim()]
    );

    if (!room) {
      await conn.rollback();
      return res
        .status(404)
        .json({
          success: false,
          error: `Room "${roomNumber}" not found. Create it first.`,
        });
    }

    const [[{ judgeCount }]] = await conn.query(
      "SELECT COUNT(*) AS judgeCount FROM users WHERE room_id = ? AND role = 'Judge'",
      [room.id]
    );
    if (judgeCount >= (room.capacity || 3)) {
      await conn.rollback();
      return res
        .status(409)
        .json({
          success: false,
          error: `Room "${roomNumber}" is full (${judgeCount}/${
            room.capacity || 3
          }).`,
        });
    }

    const [[existingJudge]] = await conn.query(
      "SELECT id, name, room_id FROM users WHERE email = ? AND role = 'Judge'",
      [judgeEmail.trim().toLowerCase()]
    );

    let judgeId, plainPassword, isNew;

    if (existingJudge) {
      judgeId = existingJudge.id;
      isNew = false;
      plainPassword = null;
      await conn.query(
        "UPDATE users SET room_id = ?, assignment_status = 'pending', name = ? WHERE id = ?",
        [room.id, judgeName.trim(), judgeId]
      );
    } else {
      isNew = true;
      // FIX: Use ISKCON-themed password generator
      plainPassword = generatePassword();
      const hashed = await bcrypt.hash(plainPassword, 10);
      const [insertResult] = await conn.query(
        `INSERT INTO users (name, email, password, role, room_id, assignment_status)
         VALUES (?, ?, ?, 'Judge', ?, 'pending')`,
        [judgeName.trim(), judgeEmail.trim().toLowerCase(), hashed, room.id]
      );
      judgeId = insertResult.insertId;
    }

    await conn.commit();

    // Send credentials email asynchronously (don't block response)
    if (isNew && plainPassword) {
      sendJudgeCredentials({
        email: judgeEmail.trim().toLowerCase(),
        username: judgeName.trim(),
        password: plainPassword,
        roomNumber: roomNumber,
        eventName: room.event_name,
      }).then((r) => {
        if (!r.sent) console.warn("[Assign] Email not sent:", r.reason);
      });
    }

    return res.json({
      success: true,
      message: existingJudge
        ? `Judge "${judgeName}" re-assigned to Room ${roomNumber}.`
        : `Judge "${judgeName}" created and assigned to Room ${roomNumber}.`,
      credentials: isNew
        ? {
            username: judgeName.trim(),
            password: plainPassword,
            email: judgeEmail.trim().toLowerCase(),
            room: roomNumber,
            note: "Credentials emailed. Share password securely if email fails.",
          }
        : {
            username: existingJudge.name,
            password: null,
            note: "Existing judge re-assigned. Password unchanged.",
          },
    });
  } catch (err) {
    await conn.rollback();
    console.error("POST /assign error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({
          success: false,
          error: "A judge with this email already exists.",
        });
    }
    return res
      .status(500)
      .json({ success: false, error: "Server error. Please try again." });
  } finally {
    conn.release();
  }
});

module.exports = router;
