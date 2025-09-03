const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

// JSON data endpoint
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
    roomsData.forEach((r) => {
      if (r.assignedCount >= r.capacity)
        alerts.push(`Room ${r.room_number} is full!`);
    });

    // Room created alert
    rooms.forEach((r) => {
      alerts.push(`Room ${r.room_number} created for event "${r.event_name}"`);
    });

    judges.forEach((j) => {
      const room = rooms.find((r) => r.id === j.room_id); // find the room for this judge

      if (j.assignment_status === "completed") {
        alerts.push(
          `Judge ${j.name} completed evaluation in Room ${
            room ? room.room_number : j.room_id
          }`
        );
      } else if (j.room_id !== null) {
        alerts.push(
          `Judge ${j.name} is assigned to Room ${
            room ? room.room_number : j.room_id
          }`
        );
      } else {
        alerts.push(`Judge ${j.name} is waiting for assignment`);
      }
    });

    rooms.forEach((r) => {
      if (r.status === "closed") {
        alerts.push({
          type: "room_closed",
          message: `Room ${r.room_number} has been closed`,
        });
      }
    });

    alerts = alerts.slice(-10).reverse();

    const assignedJudges = judges.filter((j) => j.room_id !== null).length;
    const completedJudges = judges.filter(
      (j) => j.assignment_status === "completed"
    ).length;

    res.json({
      totalRooms: rooms.length,
      openRooms: rooms.filter((r) => r.status === "open").length,
      closedRooms: rooms.filter((r) => r.status === "closed").length,
      totalJudges: judges.length,
      assignedJudges,
      completedJudges,
      rooms: roomsData,
      alerts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

//Leaderboards

module.exports = router;
