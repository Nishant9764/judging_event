// routes/judgeRouter.js — Production Grade Enhanced
"use strict";
const express = require("express");
const judgeRouter = express.Router();
const db = require("../config/db_admin");
const judgeController = require("../controllers/judgeController");

function requireJudge(req, res, next) {
  if (req.session?.user?.role === "Judge") return next();
  res.redirect("/login");
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
judgeRouter.get("/dashboard", requireJudge, async (req, res) => {
  try {
    const judge = req.session.user;
    let assignedRooms = [];

    if (judge?.room_id) {
      const [rows] = await db.query(
        "SELECT id, room_number, event_name, status, judge_done, capacity, created_at FROM rooms WHERE id = ?",
        [judge.room_id]
      );
      assignedRooms = rows || [];
    }

    // Also pull any previously assigned rooms (historical — closed rooms judge scored)
    // so judge can see their full history
    const [histRooms] = await db
      .query(
        `SELECT DISTINCT r.id, r.room_number, r.event_name, r.status, r.judge_done, r.admin_closed, r.created_at
       FROM rooms r
       JOIN student_scores ss ON ss.judge_id = ?
       JOIN schoolevents se ON se.unique_id = ss.student_id
       JOIN rooms r2 ON LOWER(TRIM(r2.event_name)) = LOWER(TRIM(se.EVENT)) AND r2.room_number = se.room
       WHERE r.id != ?
       ORDER BY r.created_at DESC
       LIMIT 10`,
        [judge.id, judge.room_id || 0]
      )
      .catch(() => [[]]);

    const allRooms = [...assignedRooms, ...(histRooms || [])];
    const assignedEvents = assignedRooms.map((r) => r.event_name);

    res.render("judge", {
      user: judge,
      assignedEvents,
      assignedRooms,
      histRooms: histRooms || [],
    });
  } catch (err) {
    console.error("Judge dashboard error:", err);
    res.status(500).send("Error loading dashboard.");
  }
});

// ── URL-based scoring ─────────────────────────────────────────────────────────
judgeRouter.get(
  "/score/:roomNumber/:eventName",
  requireJudge,
  async (req, res) => {
    try {
      const judge = req.session.user;
      const roomNumber = decodeURIComponent(req.params.roomNumber);
      const eventName = decodeURIComponent(req.params.eventName);

      if (judge.room_id) {
        const [[room]] = await db.query(
          "SELECT room_number, event_name, status FROM rooms WHERE id = ?",
          [judge.room_id]
        );
        if (room?.status === "closed") {
          return res.redirect(
            `/judge/room-closed?room=${encodeURIComponent(roomNumber)}`
          );
        }
      }

      res.redirect(
        `/judge/dashboard?autoStart=1&room=${encodeURIComponent(
          roomNumber
        )}&event=${encodeURIComponent(eventName)}`
      );
    } catch (err) {
      console.error("Judge score route error:", err);
      res.redirect("/judge/dashboard");
    }
  }
);

// ── Stats endpoint ────────────────────────────────────────────────────────────
judgeRouter.get("/stats", requireJudge, judgeController.getJudgeStats);

// ── API: Live per-room stats for judge dashboard ──────────────────────────────
// Returns: total students, scored by this judge, avg score, completion %, recent activity
judgeRouter.get("/api/room-stats/:roomId", requireJudge, async (req, res) => {
  const judgeId = req.session.user.id;
  const roomId = Number(req.params.roomId);
  try {
    // Room info
    const [[room]] = await db.query(
      "SELECT id, room_number, event_name, status, judge_done, admin_closed, capacity, created_at FROM rooms WHERE id = ?",
      [roomId]
    );
    if (!room) return res.status(404).json({ error: "Room not found" });

    // All students in this room+event
    const [allStudents] = await db.query(
      `SELECT se.NAME, se.SCHOOL, se.GROUP_ID, se.CLASS, se.SEC, se.unique_id, se.is_selected,
              COALESCE(ss_agg.total_score, NULL) AS total_score,
              COALESCE(ss_agg.judge_id, NULL)    AS judge_id,
              CASE WHEN ss_agg.student_id IS NOT NULL THEN 1 ELSE 0 END AS is_scored
       FROM schoolevents se
       LEFT JOIN (
         SELECT student_id, judge_id, SUM(score) AS total_score
         FROM student_scores
         GROUP BY student_id, judge_id
       ) ss_agg ON ss_agg.student_id = se.unique_id AND ss_agg.judge_id = ?
       WHERE LOWER(TRIM(se.EVENT))  = LOWER(TRIM(?))
         AND (se.room = ? OR se.room IS NULL OR se.room = '')
       ORDER BY se.SCHOOL, se.NAME`,
      [judgeId, room.event_name, room.room_number]
    );

    // Summary counts
    const total = allStudents.length;
    const scored = allStudents.filter((s) => s.is_scored).length;
    const present = allStudents.filter((s) => s.is_selected).length;
    const scores = allStudents
      .filter((s) => s.total_score != null)
      .map((s) => Number(s.total_score || 0));
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    const maxScore = scores.length ? Math.max(...scores) : 0;

    // Recent 8 scored by this judge (any event)
    const [recentActivity] = await db
      .query(
        `SELECT se.NAME AS student_name, se.EVENT AS event_name, SUM(ss.score) AS total, MAX(ss.created_at) AS scored_at
       FROM student_scores ss
       JOIN schoolevents se ON se.unique_id = ss.student_id
       WHERE ss.judge_id = ?
       GROUP BY ss.student_id, se.NAME, se.EVENT
       ORDER BY MAX(ss.created_at) DESC
       LIMIT 8`,
        [judgeId]
      )
      .catch(() => [[]]);

    // Score distribution
    const buckets = [0, 0, 0, 0, 0];
    scores.forEach((s) => {
      if (s <= 20) buckets[0]++;
      else if (s <= 40) buckets[1]++;
      else if (s <= 60) buckets[2]++;
      else if (s <= 80) buckets[3]++;
      else buckets[4]++;
    });

    // Top 3 students by score
    const top3 = allStudents
      .filter((s) => s.total_score != null)
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 3);

    res.json({
      room,
      stats: {
        total,
        scored,
        present,
        avgScore,
        maxScore,
        pct: total > 0 ? Math.round((scored / total) * 100) : 0,
      },
      students: allStudents,
      recentActivity: recentActivity || [],
      buckets,
      top3,
    });
  } catch (err) {
    console.error("room-stats error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ── API: Overall judge summary ─────────────────────────────────────────────────
judgeRouter.get("/api/summary", requireJudge, async (req, res) => {
  const judgeId = req.session.user.id;
  try {
    // Total scored by this judge ever
    const [[scoredRow]] = await db.query(
      "SELECT COUNT(DISTINCT student_id) AS cnt FROM student_scores WHERE judge_id = ?",
      [judgeId]
    );
    // Average score given
    const [[avgRow]] = await db.query(
      "SELECT ROUND(AVG(score),1) AS avg FROM student_scores WHERE judge_id = ?",
      [judgeId]
    );
    // Assigned room info
    const judge = req.session.user;
    let roomInfo = null;
    if (judge.room_id) {
      const [[r]] = await db.query(
        "SELECT room_number, event_name, status, judge_done FROM rooms WHERE id = ?",
        [judge.room_id]
      );
      roomInfo = r || null;
    }
    // Total students in assigned room
    let totalInRoom = 0,
      presentInRoom = 0;
    if (roomInfo) {
      const [[cnt]] = await db.query(
        "SELECT COUNT(*) AS cnt, SUM(is_selected) AS present FROM schoolevents WHERE LOWER(TRIM(EVENT)) = LOWER(TRIM(?)) AND room = ?",
        [roomInfo.event_name, roomInfo.room_number]
      );
      totalInRoom = cnt?.cnt || 0;
      presentInRoom = cnt?.present || 0;
    }
    res.json({
      totalScored: scoredRow?.cnt || 0,
      avgScore: avgRow?.avg || 0,
      totalInRoom,
      presentInRoom,
      room: roomInfo,
      status: roomInfo?.status || null,
    });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ── API: Announcements ────────────────────────────────────────────────────────
judgeRouter.get("/api/announcements", requireJudge, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, message, priority, created_at FROM announcements ORDER BY created_at DESC LIMIT 5"
    );
    res.json(rows || []);
  } catch {
    res.json([]);
  }
});

// ── Room closed / thank-you page ──────────────────────────────────────────────
judgeRouter.get("/room-closed", requireJudge, (req, res) => {
  const roomNumber = req.query.room || "";
  const waiting = req.query.waiting === "1";
  res.render("thank-you", { roomNumber, waiting });
});

module.exports = judgeRouter;
