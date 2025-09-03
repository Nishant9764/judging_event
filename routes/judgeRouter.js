// routes/judgeRouter.js
const express = require("express");
const judgeRouter = express.Router();
const db = require("../config/db_admin"); // MySQL connection
const judgeController = require("../controllers/judgeController");

// Middleware
function requireJudge(req, res, next) {
  if (req.session.user && req.session.user.role === "Judge") {
    return next();
  }
  res.render("404", { error: "Access denied. Please login as Judge." });
}

// Dashboard route
judgeRouter.get("/dashboard", requireJudge, async (req, res) => {
  try {
    const judge = req.session.user; // { id, name, role, room_id, ... }

    // Fetch assigned room(s) for this judge (get room_number + event_name)
    let assignedRooms = [];
    if (judge && judge.room_id) {
      const [rows] = await db.query(
        "SELECT id, room_number, event_name FROM rooms WHERE id = ?",
        [judge.room_id]
      );
      assignedRooms = rows || [];
    }

    // Keep assignedEvents for backwards compatibility (just names)
    const assignedEvents = assignedRooms.map((r) => r.event_name);

    // Render Judge.ejs with dynamic name and events + assignedRooms (room_number)
    res.render("judge", {
      user: judge,
      assignedEvents,
      assignedRooms,
      id: req.query.id || null,
    });
  } catch (err) {
    console.error("Error loading judge dashboard:", err);
    res.status(500).send("Error loading dashboard");
  }
});

// Stats endpoint for polling (used by frontend to update top cards)
judgeRouter.get("/stats", requireJudge, judgeController.getJudgeStats);

module.exports = judgeRouter;
