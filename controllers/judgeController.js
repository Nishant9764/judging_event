// controllers/judgeController.js — Production Grade
"use strict";
const db = require("../config/db_admin");

exports.getJudgeStats = async (req, res) => {
  try {
    const judge = req.session.user;
    if (!judge) return res.status(401).json({ error: "Not authenticated." });

    const judgeId = judge.id;

    // Get rooms assigned to this judge
    const [rooms] = await db.query(
      `SELECT r.id, r.room_number, r.event_name
       FROM rooms r
       INNER JOIN users u ON u.room_id = r.id
       WHERE u.id = ?`,
      [judgeId]
    );

    if (!rooms || rooms.length === 0) {
      return res.json({
        totalStudents: 0,
        studentsScored: 0,
        completedEvents: 0,
      });
    }

    let totalStudents = 0;
    let studentsScored = 0;
    let completedEvents = 0;

    for (const room of rooms) {
      // Count students assigned to this room
      const [[cnt]] = await db.query(
        "SELECT COUNT(*) AS cnt FROM schoolevents WHERE LOWER(TRIM(room)) = LOWER(TRIM(?))",
        [room.room_number]
      );
      const totalInRoom = Number(cnt?.cnt || 0);
      totalStudents += totalInRoom;

      // Find event_id for scoring lookup
      let eventId = null;
      if (room.event_name) {
        try {
          const [[er]] = await db.query(
            "SELECT event_id FROM events WHERE LOWER(TRIM(event_name)) = LOWER(TRIM(?)) LIMIT 1",
            [room.event_name]
          );
          if (er) eventId = er.event_id;
        } catch (_) {}
      }

      // Count students scored by THIS judge specifically
      let scoredCount = 0;
      if (eventId) {
        const [[sr]] = await db.query(
          `SELECT COUNT(DISTINCT ss.student_id) AS cnt
           FROM student_scores ss
           JOIN schoolevents se ON ss.student_id = se.unique_id
           WHERE LOWER(TRIM(se.room)) = LOWER(TRIM(?))
             AND ss.event_id  = ?
             AND ss.judge_id  = ?`,
          [room.room_number, eventId, judgeId]
        );
        scoredCount = Number(sr?.cnt || 0);
      } else {
        // Fallback: count any scores by this judge for students in this room
        const [[sr]] = await db.query(
          `SELECT COUNT(DISTINCT ss.student_id) AS cnt
           FROM student_scores ss
           JOIN schoolevents se ON ss.student_id = se.unique_id
           WHERE LOWER(TRIM(se.room)) = LOWER(TRIM(?))
             AND ss.judge_id = ?`,
          [room.room_number, judgeId]
        );
        scoredCount = Number(sr?.cnt || 0);
      }

      studentsScored += scoredCount;
      if (totalInRoom > 0 && scoredCount >= totalInRoom) completedEvents++;
    }

    res.json({ totalStudents, studentsScored, completedEvents });
  } catch (err) {
    console.error("getJudgeStats error:", err);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
};
