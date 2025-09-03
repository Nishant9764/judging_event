// routes/judgeApiRouter.js
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

// Helper to get event_id from event_name
async function getEventIdByName(eventName) {
  const [rows] = await db.query(
    "SELECT event_id FROM events WHERE event_name = ?",
    [eventName]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0].event_id;
}

/**
 * GET /api/parameters/:eventName
 * Returns parameters for the given event_name (look up event_id first).
 */
router.get("/parameters/:eventName", async (req, res) => {
  try {
    const eventName = req.params.eventName;
    const eventId = await getEventIdByName(eventName);
    if (!eventId) return res.status(404).json({ error: "Event not found" });

    const [params] = await db.query(
      "SELECT parameter_id, parameter_name, max_score FROM event_parameters WHERE event_id = ? ORDER BY parameter_id ASC",
      [eventId]
    );

    res.json(params || []);
  } catch (err) {
    console.error("Error fetching parameters:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/**
 * GET /api/students-by-room/:roomNumber
 * Returns students assigned to a particular room number (schoolevents.room).
 */
// GET students by room + event
router.get("/students-by-room-event/:room/:eventName", async (req, res) => {
  try {
    const { room, eventName } = req.params;
    const [students] = await db.query(
      "SELECT unique_id, name FROM schoolevents WHERE room = ? AND event = ?",
      [room, eventName]
    );
    res.json(students);
  } catch (err) {
    console.error("Error fetching students by room+event:", err);
    res.status(500).json({ error: "DB error" });
  }
});

module.exports = router;
