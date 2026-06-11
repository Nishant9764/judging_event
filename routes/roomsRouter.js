// routes/roomsRouter.js — Production Grade
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

// ── Room creation ─────────────────────────────────────────────────────────────
router.post("/rooms/create", async (req, res) => {
  const { roomNumber, eventName } = req.body;
  if (!roomNumber || !eventName)
    return res.status(400).json({ error: "Please fill all fields." });
  try {
    const [existing] = await db.query(
      "SELECT id FROM rooms WHERE room_number = ?",
      [roomNumber.trim()]
    );
    if (existing.length > 0)
      return res
        .status(409)
        .json({ error: `Room "${roomNumber}" already exists.` });
    const [result] = await db.query(
      "INSERT INTO rooms (room_number, event_name) VALUES (?, ?)",
      [roomNumber.trim(), eventName.trim()]
    );
    return res.json({
      success: true,
      message: "Room created successfully.",
      roomId: result.insertId,
    });
  } catch (err) {
    console.error("Create room error:", err);
    return res.status(500).json({ error: "Server error while creating room." });
  }
});

// ── Rooms for event dropdown (student table) ──────────────────────────────────
router.get("/api/rooms-for-event/:eventName", async (req, res) => {
  try {
    const eventName = decodeURIComponent(req.params.eventName).trim();
    const [rooms] = await db.query(
      `SELECT id, room_number, event_name, status
       FROM rooms
       WHERE LOWER(TRIM(event_name)) = LOWER(TRIM(?)) AND status = 'open'
       ORDER BY room_number ASC`,
      [eventName]
    );
    res.json(rooms || []);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ── All rooms (for judge assign form datalist) ────────────────────────────────
router.get("/api/all-rooms", async (req, res) => {
  try {
    const [rooms] = await db.query(
      "SELECT id, room_number, event_name, status FROM rooms ORDER BY event_name, room_number ASC"
    );
    res.json(rooms || []);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Assign room to student (validates event match) ────────────────────────────
router.post("/api/assign-room", async (req, res) => {
  const { studentName, room, studentEvent } = req.body;
  if (!studentName)
    return res
      .status(400)
      .json({ success: false, message: "Student name is required." });
  try {
    if (room && studentEvent) {
      const [roomCheck] = await db.query(
        "SELECT id FROM rooms WHERE room_number = ? AND LOWER(TRIM(event_name)) = LOWER(TRIM(?))",
        [room, studentEvent]
      );
      if (!roomCheck.length) {
        return res.status(422).json({
          success: false,
          message: `Room "${room}" is not for event "${studentEvent}". Select a valid room.`,
        });
      }
    }
    const [result] = await db.query(
      "UPDATE schoolevents SET room = ? WHERE NAME = ?",
      [room || null, studentName]
    );
    if (result.affectedRows > 0)
      return res.json({ success: true, message: "Room assigned!" });
    res
      .status(404)
      .json({ success: false, message: `Student "${studentName}" not found.` });
  } catch (err) {
    console.error("assign-room error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── Attendance: mark present/absent ──────────────────────────────────────────
router.post("/api/update-attendance", async (req, res) => {
  const { studentName, isPresent } = req.body;
  if (!studentName)
    return res
      .status(400)
      .json({ success: false, message: "Student name required." });
  try {
    const [result] = await db.query(
      "UPDATE schoolevents SET is_selected = ? WHERE NAME = ?",
      [isPresent ? 1 : 0, studentName]
    );
    if (result.affectedRows > 0) return res.json({ success: true });
    res.status(404).json({ success: false, message: "Student not found." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── Update unique_id for a student (called when checkbox is checked) ──────────
router.post("/api/update-student-id", async (req, res) => {
  const { studentName, isSelected, uniqueId } = req.body;
  if (!studentName)
    return res.status(400).json({ message: "Student name is required." });
  try {
    const [result] = await db.query(
      "UPDATE schoolevents SET is_selected = ?, unique_id = ? WHERE NAME = ?",
      [isSelected ? 1 : 0, uniqueId || null, studentName]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Student not found." });
    res.json({ message: "Status and ID updated successfully.", uniqueId });
  } catch (err) {
    console.error("update-student-id error:", err);
    res.status(500).json({ message: "Error updating database." });
  }
});

// ── Get next unique_id counter for an event ───────────────────────────────────
// Used to initialize counters from DB on page load
router.get("/api/event-id-counter/:eventName", async (req, res) => {
  try {
    const eventName = decodeURIComponent(req.params.eventName).trim();
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM schoolevents
       WHERE LOWER(TRIM(EVENT)) = LOWER(TRIM(?)) AND is_selected = 1 AND unique_id IS NOT NULL`,
      [eventName]
    );
    res.json({ count: Number(row?.cnt || 0) });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// ── Attendance stats — FIX: proper filter support ────────────────────────────
// GET /api/attendance-stats?event=Drawing&school=DPS
router.get("/api/attendance-stats", async (req, res) => {
  try {
    const { event, school } = req.query;

    // Build WHERE clauses
    let filterWhere = "WHERE 1=1";
    const filterParams = [];
    if (event && event.trim()) {
      filterWhere += " AND LOWER(TRIM(EVENT))  = LOWER(TRIM(?))";
      filterParams.push(event.trim());
    }
    if (school && school.trim()) {
      filterWhere += " AND LOWER(TRIM(SCHOOL)) = LOWER(TRIM(?))";
      filterParams.push(school.trim());
    }

    // ── Overall stats (respects filters) ─────────────────────────────────────
    const [[overall]] = await db.query(
      `SELECT
         COUNT(*)                      AS total,
         COALESCE(SUM(is_selected), 0) AS present,
         COUNT(*) - COALESCE(SUM(is_selected), 0) AS absent
       FROM schoolevents ${filterWhere}`,
      filterParams
    );

    // ── By event (always unfiltered for the table, but filtered by school) ────
    let evWhere = "WHERE 1=1";
    const evParams = [];
    if (school && school.trim()) {
      evWhere += " AND LOWER(TRIM(SCHOOL)) = LOWER(TRIM(?))";
      evParams.push(school.trim());
    }
    if (event && event.trim()) {
      evWhere += " AND LOWER(TRIM(EVENT))  = LOWER(TRIM(?))";
      evParams.push(event.trim());
    }

    const [byEvent] = await db.query(
      `SELECT
         EVENT AS event_name,
         COUNT(*) AS total,
         COALESCE(SUM(is_selected), 0) AS present,
         COUNT(*) - COALESCE(SUM(is_selected), 0) AS absent,
         ROUND(COALESCE(SUM(is_selected), 0) / COUNT(*) * 100, 1) AS attendance_pct
       FROM schoolevents ${evWhere}
       GROUP BY EVENT
       ORDER BY EVENT ASC`,
      evParams
    );

    // ── By school (always unfiltered school dimension, but filtered by event) ─
    let scWhere = "WHERE 1=1";
    const scParams = [];
    if (event && event.trim()) {
      scWhere += " AND LOWER(TRIM(EVENT))  = LOWER(TRIM(?))";
      scParams.push(event.trim());
    }
    if (school && school.trim()) {
      scWhere += " AND LOWER(TRIM(SCHOOL)) = LOWER(TRIM(?))";
      scParams.push(school.trim());
    }

    const [bySchool] = await db.query(
      `SELECT
         SCHOOL AS school_name,
         COUNT(*) AS total,
         COALESCE(SUM(is_selected), 0) AS present,
         COUNT(*) - COALESCE(SUM(is_selected), 0) AS absent,
         ROUND(COALESCE(SUM(is_selected), 0) / COUNT(*) * 100, 1) AS attendance_pct
       FROM schoolevents ${scWhere}
       GROUP BY SCHOOL
       ORDER BY present DESC`,
      scParams
    );

    res.json({
      overall: overall || { total: 0, present: 0, absent: 0 },
      byEvent,
      bySchool,
      // No absentees table — export handled client-side
    });
  } catch (err) {
    console.error("attendance-stats error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

module.exports = router;
