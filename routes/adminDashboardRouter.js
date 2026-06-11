// routes/adminDashboardRouter.js — Production Grade
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

function requireAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.role === "Administrator"
  )
    return next();
  res.status(403).json({ error: "Admins only." });
}

// GET /admin/dashboard-data
router.get("/admin/dashboard-data", requireAdmin, async (req, res) => {
  try {
    // ── Rooms with judge counts ───────────────────────────────────────────────
    const [rooms] = await db.query(`
      SELECT r.*,
        COUNT(u.id)                                                          AS judge_count,
        SUM(CASE WHEN u.assignment_status = 'completed' THEN 1 ELSE 0 END) AS completed_judges
      FROM rooms r
      LEFT JOIN users u ON u.room_id = r.id AND u.role = 'Judge'
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);

    // ── Per-room enrichment (judges list + student scoring progress) ──────────
    const roomsData = await Promise.all(
      rooms.map(async (room) => {
        const [judges] = await db.query(
          "SELECT id, name, email, assignment_status FROM users WHERE room_id = ? AND role = 'Judge'",
          [room.id]
        );

        let totalStudents = 0,
          scoredStudents = 0;
        try {
          const [[tc]] = await db.query(
            "SELECT COUNT(*) AS cnt FROM schoolevents WHERE LOWER(TRIM(room)) = LOWER(TRIM(?))",
            [room.room_number]
          );
          totalStudents = Number(tc?.cnt || 0);

          const [[sc]] = await db.query(
            `SELECT COUNT(DISTINCT ss.student_id) AS cnt
           FROM student_scores ss
           JOIN schoolevents se ON ss.student_id = se.unique_id
           WHERE LOWER(TRIM(se.room)) = LOWER(TRIM(?))`,
            [room.room_number]
          );
          scoredStudents = Number(sc?.cnt || 0);
        } catch (_) {}

        return {
          id: room.id,
          room_number: room.room_number,
          event_name: room.event_name,
          capacity: room.capacity || 3,
          status: room.status || "open",
          judge_done: room.judge_done || 0,
          admin_closed: room.admin_closed || 0,
          assignedCount: judges.length,
          totalStudents,
          scoredStudents,
          judges,
        };
      })
    );

    // ── Judges list ───────────────────────────────────────────────────────────
    const [judges] = await db.query(`
      SELECT u.id, u.name, u.email, u.assignment_status, u.room_id,
             r.room_number, r.event_name
      FROM users u
      LEFT JOIN rooms r ON r.id = u.room_id
      WHERE u.role = 'Judge'
      ORDER BY u.name ASC
    `);

    // ── Help requests (pending count) ─────────────────────────────────────────
    let helpPendingCount = 0;
    try {
      const [[hc]] = await db.query(
        "SELECT COUNT(*) AS cnt FROM help_requests WHERE status = 'pending'"
      );
      helpPendingCount = Number(hc?.cnt || 0);
    } catch (_) {}

    // ── Scoring overview ──────────────────────────────────────────────────────
    const [[ov]] = await db.query(`
      SELECT
        COUNT(DISTINCT SCHOOL) AS schools,
        COUNT(DISTINCT EVENT)  AS events,
        COUNT(*)               AS students
      FROM schoolevents
    `);

    let scoredStudentsTotal = 0;
    try {
      const [[ss]] = await db.query(
        "SELECT COUNT(DISTINCT student_id) AS cnt FROM student_scores"
      );
      scoredStudentsTotal = Number(ss?.cnt || 0);
    } catch (_) {}

    // ── Build alerts ──────────────────────────────────────────────────────────
    const alerts = [];

    // Help requests first (highest priority)
    try {
      const [helpReqs] = await db.query(
        "SELECT * FROM help_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5"
      );
      helpReqs.forEach((h) =>
        alerts.push({
          type: "help",
          icon: "🆘",
          message: `${h.judge_name} (Room ${
            h.room_number || "?"
          }) needs help: "${h.message}"`,
          time: h.created_at,
          id: h.id,
        })
      );
    } catch (_) {}

    // Rooms ready for admin close
    roomsData.forEach((r) => {
      if (r.judge_done && r.status !== "closed") {
        alerts.push({
          type: "room_ready",
          icon: "🔔",
          message: `Room ${r.room_number} (${r.event_name}) — all judges done. Click Final Close.`,
          roomId: r.id,
        });
      }
    });

    // Recently closed rooms
    roomsData
      .filter((r) => r.status === "closed")
      .slice(0, 3)
      .forEach((r) => {
        alerts.push({
          type: "room_closed",
          icon: "✅",
          message: `Room ${r.room_number} is officially closed.`,
        });
      });

    // Full rooms
    roomsData.forEach((r) => {
      if (r.assignedCount >= r.capacity && r.status !== "closed") {
        alerts.push({
          type: "room_full",
          icon: "📌",
          message: `Room ${r.room_number} is at full capacity (${r.assignedCount}/${r.capacity}).`,
        });
      }
    });

    // Judge completions
    judges
      .filter((j) => j.assignment_status === "completed")
      .forEach((j) => {
        alerts.push({
          type: "judge_done",
          icon: "👤",
          message: `Judge ${j.name} completed scoring in Room ${
            j.room_number || "N/A"
          }.`,
        });
      });

    const pct =
      ov.students > 0
        ? Math.round((scoredStudentsTotal / ov.students) * 100)
        : 0;

    res.json({
      // Counters
      totalRooms: rooms.length,
      openRooms: rooms.filter((r) => r.status === "open").length,
      closedRooms: rooms.filter((r) => r.status === "closed").length,
      pendingClose: roomsData.filter(
        (r) => r.judge_done && r.status !== "closed"
      ).length,
      totalJudges: judges.length,
      assignedJudges: judges.filter((j) => j.room_id !== null).length,
      completedJudges: judges.filter((j) => j.assignment_status === "completed")
        .length,
      totalStudents: ov.students || 0,
      totalSchools: ov.schools || 0,
      totalEvents: ov.events || 0,
      scoredStudents: scoredStudentsTotal,
      scoringPct: pct,
      helpPendingCount,
      // Lists
      rooms: roomsData,
      judges,
      alerts: alerts.slice(0, 20),
    });
  } catch (err) {
    console.error("dashboard-data error:", err);
    res.status(500).json({ error: "Failed to load dashboard data." });
  }
});

module.exports = router;
