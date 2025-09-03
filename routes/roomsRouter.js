const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

router.post("/rooms/create", async (req, res) => {
  const { roomNumber, eventName } = req.body;

  if (!roomNumber || !eventName) {
    return res.status(400).json({ error: "Please fill all fields" });
  }

  try {
    // 1️⃣ Check if room exists
    const [existing] = await db.query(
      "SELECT id FROM rooms WHERE room_number = ?",
      [roomNumber]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "Room number already exists" });
    }

    // 2️⃣ Insert room
    const [result] = await db.query(
      "INSERT INTO rooms (room_number, event_name) VALUES (?, ?)",
      [roomNumber, eventName]
    );

    // 3️⃣ Success response
    return res.status(200).json({
      success: true,
      message: "Room created successfully",
      roomId: result.insertId,
    });
  } catch (err) {
    console.error("DB Error:", err);
    return res.status(500).json({ error: "Server error while creating room" });
  }
});

module.exports = router;
