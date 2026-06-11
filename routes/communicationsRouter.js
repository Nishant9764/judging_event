// routes/communicationsRouter.js — Production Grade
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Not authenticated." });
}
function requireAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.role === "Administrator"
  )
    return next();
  res.status(403).json({ error: "Admins only." });
}

// ─── Auto-cleanup (run on every request, ~1% of the time to avoid overhead) ──
async function maybeCleanup() {
  if (Math.random() > 0.02) return; // run ~2% of requests
  try {
    // Delete resolved help requests
    await db.query("DELETE FROM help_requests WHERE status = 'resolved'");
    // Delete messages older than 10 minutes
    await db.query(
      "DELETE FROM messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
    );
    // Deactivate announcements older than 10 minutes
    await db.query(
      "UPDATE announcements SET is_active = 0 WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND is_active = 1"
    );
  } catch (_) {
    /* silent */
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/announcements — judges poll this
router.get("/announcements", requireAuth, async (req, res) => {
  await maybeCleanup();
  try {
    const [rows] = await db.query(
      `SELECT id, message, priority, created_by, created_at
       FROM announcements
       WHERE is_active = 1
       ORDER BY created_at DESC
       LIMIT 5`
    );
    res.json(rows || []);
  } catch (err) {
    console.error("GET /announcements:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/announcements — admin creates
router.post("/announcements", requireAdmin, async (req, res) => {
  try {
    const { message, priority = "normal" } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }
    const [result] = await db.query(
      "INSERT INTO announcements (message, priority, created_by) VALUES (?, ?, ?)",
      [
        message.trim(),
        priority === "urgent" ? "urgent" : "normal",
        req.session.user.name,
      ]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("POST /announcements:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// DELETE /api/announcements/:id
router.delete("/announcements/:id", requireAdmin, async (req, res) => {
  try {
    await db.query("UPDATE announcements SET is_active = 0 WHERE id = ?", [
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// DELETE /api/announcements — clear all
router.delete("/announcements", requireAdmin, async (req, res) => {
  try {
    await db.query("UPDATE announcements SET is_active = 0");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// HELP REQUESTS (judge → admin)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/help-request
router.post("/help-request", requireAuth, async (req, res) => {
  try {
    const judge = req.session.user;
    if (judge.role !== "Judge")
      return res.status(403).json({ error: "Judges only." });

    const { message = "I need help!" } = req.body;

    // Get room_number
    let roomNumber = null;
    if (judge.room_id) {
      try {
        const [[room]] = await db.query(
          "SELECT room_number FROM rooms WHERE id = ?",
          [judge.room_id]
        );
        roomNumber = room ? room.room_number : null;
      } catch (_) {}
    }

    const [result] = await db.query(
      "INSERT INTO help_requests (judge_id, judge_name, room_number, message) VALUES (?, ?, ?, ?)",
      [judge.id, judge.name, roomNumber, String(message).trim().slice(0, 500)]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("POST /help-request:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/help-requests — admin sees pending + acknowledged
router.get("/help-requests", requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM help_requests
       WHERE status IN ('pending','acknowledged')
       ORDER BY FIELD(status,'pending','acknowledged'), created_at DESC
       LIMIT 50`
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/help-requests/count — pending count for badge
router.get("/help-requests/count", requireAdmin, async (req, res) => {
  try {
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM help_requests WHERE status = 'pending'"
    );
    res.json({ pending: Number(row.cnt) });
  } catch (err) {
    res.json({ pending: 0 });
  }
});

// PUT /api/help-requests/:id — acknowledge or resolve
router.put("/help-requests/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    if (status === "resolved") {
      // FIX: Delete resolved requests immediately to not spam DB
      await db.query("DELETE FROM help_requests WHERE id = ?", [req.params.id]);
    } else {
      await db.query("UPDATE help_requests SET status = ? WHERE id = ?", [
        status,
        req.params.id,
      ]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES — FIX: proper to_id filtering so messages are private
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/messages — get messages for current user
// FIX: Judges only see: (a) broadcasts (to_id IS NULL) + (b) messages addressed to them
//      Admins see all messages (they can filter by judge in UI)
router.get("/messages", requireAuth, async (req, res) => {
  await maybeCleanup();
  try {
    const user = req.session.user;

    if (user.role === "Administrator") {
      // Admin sees everything — they use the UI to filter by judge
      const [rows] = await db.query(
        `SELECT * FROM messages ORDER BY created_at ASC LIMIT 200`
      );
      res.json(rows || []);
    } else {
      // Judge ONLY sees:
      // 1. Messages sent specifically to them (to_id = their id)
      // 2. Broadcasts (to_id IS NULL AND from_role = 'Administrator')
      // 3. Their own sent messages
      const [rows] = await db.query(
        `SELECT * FROM messages
         WHERE
           (to_id = ? AND from_role = 'Administrator')
           OR (to_id IS NULL AND from_role = 'Administrator')
           OR (from_id = ? AND from_role = 'Judge')
         ORDER BY created_at ASC
         LIMIT 100`,
        [user.id, user.id]
      );
      res.json(rows || []);
    }
  } catch (err) {
    console.error("GET /messages:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/messages/with-judge/:judgeId — admin views conversation with specific judge
router.get("/messages/with-judge/:judgeId", requireAdmin, async (req, res) => {
  try {
    const judgeId = Number(req.params.judgeId);
    const [rows] = await db.query(
      `SELECT * FROM messages
       WHERE
         (from_id = ? AND from_role = 'Judge')
         OR (to_id = ? AND from_role = 'Administrator')
         OR (to_id IS NULL AND from_role = 'Administrator')
       ORDER BY created_at ASC
       LIMIT 100`,
      [judgeId, judgeId]
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/messages/unread
router.get("/messages/unread", requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    let count = 0;
    if (user.role === "Judge") {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM messages
         WHERE from_role = 'Administrator'
           AND is_read = 0
           AND (to_id = ? OR to_id IS NULL)`,
        [user.id]
      );
      count = Number(row.cnt);
    } else {
      const [[row]] = await db.query(
        "SELECT COUNT(*) AS cnt FROM messages WHERE from_role = 'Judge' AND is_read = 0"
      );
      count = Number(row.cnt);
    }
    res.json({ unread: count });
  } catch (err) {
    res.json({ unread: 0 });
  }
});

// POST /api/messages — send a message
// FIX: to_id = null means broadcast, to_id = specific judge means private
router.post("/messages", requireAuth, async (req, res) => {
  try {
    const sender = req.session.user;
    const { body, to_id = null, to_name = null } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Message body required." });
    }

    // Judges can only send to admin (no to_id targeting from judge side)
    const finalToId =
      sender.role === "Judge" ? null : to_id ? Number(to_id) : null;
    const finalToName = sender.role === "Judge" ? "Admin" : to_name || null;

    await db.query(
      `INSERT INTO messages (from_id, from_name, from_role, to_id, to_name, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sender.id,
        sender.name,
        sender.role,
        finalToId,
        finalToName,
        body.trim().slice(0, 1000),
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /messages:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// PUT /api/messages/read — mark as read
router.put("/messages/read", requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    if (user.role === "Judge") {
      await db.query(
        "UPDATE messages SET is_read = 1 WHERE (to_id = ? OR to_id IS NULL) AND from_role = 'Administrator'",
        [user.id]
      );
    } else {
      await db.query(
        "UPDATE messages SET is_read = 1 WHERE from_role = 'Judge'"
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROOM MANAGEMENT (admin final close / reopen)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/rooms-status — full room status for admin
router.get("/rooms-status", requireAdmin, async (req, res) => {
  try {
    const [rooms] = await db.query(`
      SELECT r.*,
        COUNT(u.id) AS judge_count,
        SUM(CASE WHEN u.assignment_status='completed' THEN 1 ELSE 0 END) AS completed_judges
      FROM rooms r
      LEFT JOIN users u ON u.room_id = r.id AND u.role = 'Judge'
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json(rooms || []);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/admin-close-room/:id
router.post("/admin-close-room/:id", requireAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    await db.query("UPDATE rooms SET status = 'closed' WHERE id = ?", [roomId]);
    try {
      await db.query("UPDATE rooms SET admin_closed = 1 WHERE id = ?", [
        roomId,
      ]);
    } catch (_) {}
    const [[room]] = await db.query(
      "SELECT room_number FROM rooms WHERE id = ?",
      [roomId]
    );
    res.json({
      success: true,
      message: `Room ${room ? room.room_number : roomId} officially closed.`,
    });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/admin-reopen-room/:id
router.post("/admin-reopen-room/:id", requireAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    await db.query("UPDATE rooms SET status = 'open' WHERE id = ?", [roomId]);
    try {
      await db.query(
        "UPDATE rooms SET judge_done = 0, admin_closed = 0 WHERE id = ?",
        [roomId]
      );
    } catch (_) {}
    await db.query(
      "UPDATE users SET assignment_status = 'pending' WHERE room_id = ? AND role = 'Judge'",
      [roomId]
    );
    const [[room]] = await db.query(
      "SELECT room_number FROM rooms WHERE id = ?",
      [roomId]
    );
    res.json({
      success: true,
      message: `Room ${room ? room.room_number : roomId} reopened.`,
    });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

module.exports = router;
