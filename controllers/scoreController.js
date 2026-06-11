const db = require("../config/db_admin");

async function getEventIdByName(eventName) {
  const [rows] = await db.query(
    "SELECT event_id FROM events WHERE event_name = ?",
    [eventName]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0].event_id;
}

async function submitScore(req, res) {
  console.log(`--- [DEBUG] Received a request to /api/submit-score ---`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("Request Body Received:", req.body);

  const { studentId, eventName, scores, comments } = req.body;

  if (!studentId || !eventName || !scores) {
    return res.status(400).json({ error: "Missing required data." });
  }

  console.log("[DEBUG] Extracted Data from Body:");
  console.log(`  - studentId: ${studentId}`);
  console.log(`  - eventName: ${eventName}`);
  console.log(`  - scores:`, scores);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`[DEBUG] Looking up event ID for eventName: "${eventName}"`);
    const eventId = await getEventIdByName(eventName);
    if (!eventId) {
      console.error(
        `[DEBUG] CRITICAL ERROR: Event named "${eventName}" not found in the database.`
      );
      throw new Error(`Event with name "${eventName}" not found.`);
    }

    console.log(
      `[DEBUG] Found eventId: ${eventId}. Proceeding with transaction.`
    ); // Delete old scores to prevent duplicates

    await connection.query(
      "DELETE FROM student_scores WHERE student_id = ? AND event_id = ?",
      [studentId, eventId]
    );

    console.log(`[DEBUG] Inserting scores for studentId: ${studentId}`); // Insert new scores for each parameter
    const scoreInserts = Object.entries(scores).map(([parameter_id, score]) => {
      return connection.query(
        "INSERT INTO student_scores (student_id, event_id, parameter_id, score) VALUES (?, ?, ?, ?)",
        [studentId, eventId, parameter_id, score]
      );
    });
    await Promise.all(scoreInserts); // Update comments

    await connection.query(
      "UPDATE schoolevents SET comments = ? WHERE unique_id = ?",
      [comments, studentId]
    );

    await connection.commit();
    console.log(
      "[DEBUG] SUCCESS: Database transaction committed successfully."
    );
    res.json({ success: true, message: "Scores submitted successfully." });
  } catch (err) {
    await connection.rollback();
    console.error("[DEBUG] DATABASE TRANSACTION FAILED:", err);
    res.status(500).json({ error: "Database operation failed." });
  } finally {
    connection.release();
  }
}

module.exports = {
  submitScore,
};
