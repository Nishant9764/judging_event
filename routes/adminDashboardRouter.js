// routes/adminDashboard.js
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin"); // promise pool (you already have)

// JSON API
// JSON API
// JSON API
router.get("/dashboard-data", async (req, res) => {
  try {
    const [rooms] = await db.query("SELECT * FROM rooms");
    const [judges] = await db.query("SELECT * FROM users WHERE role='Judge'");

    const roomsData = await Promise.all(
      rooms.map(async (room) => {
        const [assigned] = await db.query(
          "SELECT name, assignment_status FROM users WHERE room_id=?",
          [room.id]
        );
        return {
          room_number: room.room_number,
          event_name: room.event_name,
          capacity: room.capacity,
          assignedCount: assigned.length,
          judges: assigned,
        };
      })
    );

    let alerts = [];

    // Room created alert
    rooms.forEach((r) => {
      alerts.push(`Room ${r.room_number} created for event "${r.event_name}"`);
    });

    // Room status
    rooms.forEach((r) => {
      if (r.status === "closed") {
        alerts.push(`Room ${r.room_number} has been closed`);
      }
      if (
        r.capacity &&
        r.capacity <=
          roomsData.find((rd) => rd.room_number === r.room_number).assignedCount
      ) {
        alerts.push(`Room ${r.room_number} is full!`);
      }
    });

    // Judge activities
    judges.forEach((j) => {
      if (j.assignment_status === "completed") {
        alerts.push(
          `Judge ${j.name} completed evaluation in Room ${j.room_id}`
        );
      } else if (j.room_id !== null) {
        alerts.push(`Judge ${j.name} is assigned to Room ${j.room_id}`);
      } else {
        alerts.push(`Judge ${j.name} is waiting for assignment`);
      }
    });

    // Keep latest 10
    alerts = alerts.slice(-10);

    res.json({
      totalRooms: rooms.length,
      openRooms: rooms.filter((r) => r.status === "open").length,
      closedRooms: rooms.filter((r) => r.status === "closed").length,
      totalJudges: judges.length,
      assignedJudges: judges.filter((j) => j.room_id !== null).length,
      completedJudges: judges.filter((j) => j.assignment_status === "completed")
        .length,
      rooms: roomsData,
      alerts,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

module.exports = router;
