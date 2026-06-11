// routes/judgeApiRouter.js — Production Grade
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

function requireJudge(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) return next();
  return res.status(401).json({ error: "Not authenticated." });
}

async function getEventIdByName(eventName) {
  if (!eventName) return null;
  try {
    const [rows] = await db.query(
      "SELECT event_id FROM events WHERE LOWER(TRIM(event_name)) = LOWER(TRIM(?)) LIMIT 1",
      [String(eventName).trim()]
    );
    return rows && rows.length ? rows[0].event_id : null;
  } catch (err) {
    console.error("getEventIdByName:", err.message);
    return null;
  }
}

// FIX: Check if judge's room is closed — prevents scoring on closed rooms
async function isRoomClosed(judgeId) {
  try {
    const [[user]] = await db.query("SELECT room_id FROM users WHERE id = ?", [
      judgeId,
    ]);
    if (!user || !user.room_id) return false;
    const [[room]] = await db.query("SELECT status FROM rooms WHERE id = ?", [
      user.room_id,
    ]);
    return room && room.status === "closed";
  } catch (_) {
    return false;
  }
}

// GET /api/debug-event/:eventName — diagnostic endpoint
router.get("/debug-event/:eventName", requireJudge, async (req, res) => {
  try {
    const eventName = req.params.eventName;
    const judge = req.session.user;
    const [eventsAll] = await db.query("SELECT * FROM events");
    let room = null;
    if (judge.room_id) {
      const [[r]] = await db.query("SELECT * FROM rooms WHERE id = ?", [
        judge.room_id,
      ]);
      room = r;
    }
    const eventId = await getEventIdByName(eventName);
    const [students] = await db.query(
      "SELECT unique_id, NAME, room, EVENT FROM schoolevents WHERE LOWER(TRIM(EVENT)) = LOWER(TRIM(?)) LIMIT 5",
      [eventName]
    );
    res.json({
      searched_for: eventName,
      found_event_id: eventId,
      judge_id: judge.id,
      judge_room_id: judge.room_id,
      room_record: room,
      all_events_in_db: eventsAll,
      sample_students: students,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/judge-room-status — judge checks their room status
router.get("/judge-room-status", requireJudge, async (req, res) => {
  try {
    const judgeId = req.session.user.id;
    const [[user]] = await db.query(
      "SELECT room_id, assignment_status FROM users WHERE id = ?",
      [judgeId]
    );
    if (!user || !user.room_id) {
      return res.json({ status: "no_room", roomNumber: null });
    }
    const [[room]] = await db.query(
      "SELECT room_number, event_name, status FROM rooms WHERE id = ?",
      [user.room_id]
    );
    res.json({
      status: room ? room.status : "unknown",
      roomNumber: room ? room.room_number : null,
      eventName: room ? room.event_name : null,
      judgeStatus: user.assignment_status,
    });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/parameters/:eventName
router.get("/parameters/:eventName", requireJudge, async (req, res) => {
  try {
    const eventName = decodeURIComponent(req.params.eventName).trim();
    const eventId = await getEventIdByName(eventName);
    if (!eventId) {
      console.warn(`[parameters] No event_id for "${eventName}"`);
      return res.json([]);
    }
    const [params] = await db.query(
      "SELECT parameter_id, parameter_name, max_score FROM event_parameters WHERE event_id = ? ORDER BY parameter_id ASC",
      [eventId]
    );
    res.json(params || []);
  } catch (err) {
    console.error("GET /parameters:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/students-by-room-event/:room/:eventName
router.get(
  "/students-by-room-event/:room/:eventName",
  requireJudge,
  async (req, res) => {
    try {
      const room = decodeURIComponent(req.params.room).trim();
      const eventName = decodeURIComponent(req.params.eventName).trim();
      const judgeId = req.session.user.id;

      const eventId = await getEventIdByName(eventName);

      if (eventId) {
        const [students] = await db.query(
          `SELECT
           se.unique_id,
           se.NAME       AS name,
           se.SCHOOL     AS school,
           se.GROUP_ID   AS group_id,
           se.CLASS,
           se.SEC,
           se.is_selected,
           (CASE WHEN EXISTS (
             SELECT 1 FROM student_scores ss
             WHERE ss.student_id = se.unique_id
               AND ss.event_id   = ?
               AND ss.judge_id   = ?
           ) THEN 1 ELSE 0 END) AS scored
         FROM schoolevents se
         WHERE LOWER(TRIM(se.room))  = LOWER(TRIM(?))
           AND LOWER(TRIM(se.EVENT)) = LOWER(TRIM(?))
           AND se.unique_id IS NOT NULL
           AND se.unique_id != ''
         ORDER BY se.NAME ASC`,
          [eventId, judgeId, room, eventName]
        );
        return res.json(students || []);
      }

      // Degraded: return students without scored flag
      console.warn(`[students] No event_id for "${eventName}" — degraded mode`);
      const [students] = await db.query(
        `SELECT se.unique_id, se.NAME AS name, se.SCHOOL AS school,
              se.GROUP_ID AS group_id, se.CLASS, se.SEC, se.is_selected, 0 AS scored
       FROM schoolevents se
       WHERE LOWER(TRIM(se.room))  = LOWER(TRIM(?))
         AND LOWER(TRIM(se.EVENT)) = LOWER(TRIM(?))
         AND se.unique_id IS NOT NULL AND se.unique_id != ''
       ORDER BY se.NAME ASC`,
        [room, eventName]
      );
      res.json(students || []);
    } catch (err) {
      console.error("GET /students-by-room-event:", err);
      res.status(500).json({ error: "DB error" });
    }
  }
);

// GET /api/student-scores/:studentId/:eventName
router.get(
  "/student-scores/:studentId/:eventName",
  requireJudge,
  async (req, res) => {
    try {
      const studentId = decodeURIComponent(req.params.studentId).trim();
      const eventName = decodeURIComponent(req.params.eventName).trim();
      const judgeId = req.session.user.id;
      const eventId = await getEventIdByName(eventName);
      if (!eventId) return res.json({});
      const [scores] = await db.query(
        "SELECT parameter_id, score FROM student_scores WHERE student_id = ? AND event_id = ? AND judge_id = ?",
        [studentId, eventId, judgeId]
      );
      const map = scores.reduce((acc, r) => {
        acc[r.parameter_id] = r.score;
        return acc;
      }, {});
      res.json(map);
    } catch (err) {
      console.error("GET /student-scores:", err);
      res.status(500).json({ error: "DB error" });
    }
  }
);

// POST /api/submit-score — FIX: blocked on closed rooms
router.post("/submit-score", requireJudge, async (req, res) => {
  const { studentId, eventName, scores, comments } = req.body;
  const judgeId = req.session.user.id;

  if (!studentId || !eventName || !scores) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // Block scoring on closed rooms
  if (await isRoomClosed(judgeId)) {
    return res
      .status(403)
      .json({
        error: "This room has been closed. Scoring is no longer allowed.",
      });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const eventId = await getEventIdByName(String(eventName).trim());
    if (!eventId) {
      return res.status(422).json({
        error: `Event "${eventName}" not found in events table. Ask admin to add it.`,
      });
    }

    await conn.query(
      "DELETE FROM student_scores WHERE student_id = ? AND event_id = ? AND judge_id = ?",
      [studentId, eventId, judgeId]
    );

    if (Object.keys(scores).length > 0) {
      const values = Object.entries(scores).map(([parameter_id, score]) => [
        studentId,
        eventId,
        Number(parameter_id),
        Number(score),
        judgeId,
      ]);
      await conn.query(
        "INSERT INTO student_scores (student_id, event_id, parameter_id, score, judge_id) VALUES ?",
        [values]
      );
    }

    if (comments !== undefined) {
      await conn.query(
        "UPDATE schoolevents SET comments = ? WHERE unique_id = ?",
        [comments || "", studentId]
      );
    }

    await conn.commit();
    res.json({ success: true, message: "Scores submitted successfully." });
  } catch (err) {
    await conn.rollback();
    console.error("POST /submit-score:", err);
    res.status(500).json({ error: err.message || "DB error" });
  } finally {
    conn.release();
  }
});

// POST /api/close-room
router.post("/close-room", requireJudge, async (req, res) => {
  try {
    const judgeId = req.session.user.id;
    const [[user]] = await db.query("SELECT room_id FROM users WHERE id = ?", [
      judgeId,
    ]);
    if (!user || !user.room_id)
      return res.status(400).json({ error: "No room assigned." });

    const roomId = user.room_id;
    const [[room]] = await db.query("SELECT * FROM rooms WHERE id = ?", [
      roomId,
    ]);
    if (!room) return res.status(404).json({ error: "Room not found." });

    if (room.status === "closed") {
      return res.json({
        success: true,
        allJudgesDone: true,
        redirect: `/judge/room-closed?room=${encodeURIComponent(
          room.room_number
        )}`,
        message: "This room is already closed.",
      });
    }

    await db.query(
      "UPDATE users SET assignment_status = 'completed' WHERE id = ?",
      [judgeId]
    );

    const [allJudges] = await db.query(
      "SELECT assignment_status FROM users WHERE room_id = ? AND role = 'Judge'",
      [roomId]
    );
    const allDone =
      allJudges.length > 0 &&
      allJudges.every((j) => j.assignment_status === "completed");

    if (allDone) {
      try {
        await db.query("UPDATE rooms SET judge_done = 1 WHERE id = ?", [
          roomId,
        ]);
      } catch (_) {}
    }

    return res.json({
      success: true,
      allJudgesDone: allDone,
      redirect: `/judge/room-closed?room=${encodeURIComponent(
        room.room_number
      )}${allDone ? "" : "&waiting=1"}`,
      message: allDone
        ? "All judges done. Waiting for admin to officially close the room."
        : "Your scoring marked complete. Waiting for other judges.",
    });
  } catch (err) {
    console.error("POST /close-room:", err);
    res.status(500).json({ error: "DB error" });
  }
});

module.exports = router;
