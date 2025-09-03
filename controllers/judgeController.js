// controllers/judgeController.js
const db = require("../config/db_admin"); // adjust path if needed

exports.getJudgeStats = async (req, res) => {
  try {
    const judge = req.session.user;
    if (!judge) return res.status(401).json({ error: "Not authenticated" });

    // Get rooms assigned to this judge (by users.room_id)
    const [rooms] = await db.query(
      "SELECT id, room_number, event_name FROM rooms WHERE id IN (SELECT room_id FROM users WHERE id = ?)",
      [judge.id]
    );

    if (!rooms || rooms.length === 0) {
      return res.json({
        assignedEvents: [],
        totalStudents: 0,
        studentsScored: 0,
        completedEvents: 0,
      });
    }

    let totalStudents = 0;
    let studentsScored = 0;
    let completedEvents = 0;

    // For each assigned room, count students and scored students (by room number)
    for (const room of rooms) {
      const roomNumber = room.room_number;

      // total students in this room (schoolevents.room)
      const [cntRows] = await db.query(
        "SELECT COUNT(*) AS cnt FROM schoolevents WHERE room = ?",
        [roomNumber]
      );
      const totalInRoom = Number(cntRows[0]?.cnt || 0);
      totalStudents += totalInRoom;

      // Find event_id for this room's event_name (if exists)
      let eventId = null;
      if (room.event_name) {
        const [er] = await db.query(
          "SELECT event_id FROM events WHERE event_name = ? LIMIT 1",
          [room.event_name]
        );
        if (er && er.length > 0) eventId = er[0].event_id;
      }

      // Count distinct scored students for this room
      let scoredCount = 0;
      if (eventId) {
        // Count students who have at least one score for this event and belong to this room
        const [scRows] = await db.query(
          `SELECT COUNT(DISTINCT ss.student_id) AS scoredCount
           FROM student_scores ss
           JOIN schoolevents se ON ss.student_id = se.unique_id
           WHERE se.room = ? AND ss.event_id = ?`,
          [roomNumber, eventId]
        );
        scoredCount = Number(scRows[0]?.scoredCount || 0);
      } else {
        // fallback: count any score entries for students in this room
        const [scRows] = await db.query(
          `SELECT COUNT(DISTINCT ss.student_id) AS scoredCount
           FROM student_scores ss
           JOIN schoolevents se ON ss.student_id = se.unique_id
           WHERE se.room = ?`,
          [roomNumber]
        );
        scoredCount = Number(scRows[0]?.scoredCount || 0);
      }
      studentsScored += scoredCount;

      // Completed if every student in room has a score
      if (totalInRoom > 0 && scoredCount >= totalInRoom) {
        completedEvents += 1;
      }
    }

    const assignedEvents = rooms.map((r) => ({
      id: r.id,
      event_name: r.event_name,
      room_number: r.room_number,
    }));

    res.json({
      assignedEvents,
      totalStudents,
      studentsScored,
      completedEvents,
    });
  } catch (err) {
    console.error("Error fetching judge stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};
