const express = require("express");
const router = express.Router();
const db = require("../config/db_admin"); // your mysql2/promise pool

async function runQuery(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * GET /api/leaderboard
 * Optional query params: event_id, group_id
 * Returns judged students only, total score, rank
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const { event_id, group_id } = req.query;

    let sql = `
      SELECT 
        se.unique_id,
        se.name AS student_name,
        se.school AS school_name,
        se.event AS event_name,
        se.group_id,
        SUM(ss.score) AS total_score
      FROM schoolevents se
      INNER JOIN student_scores ss ON se.unique_id = ss.student_id
      WHERE 1=1
    `;
    const params = [];

    if (event_id) {
      sql += " AND se.event = ?";
      params.push(event_id);
    }

    if (group_id) {
      sql += " AND se.group_id = ?";
      params.push(group_id);
    }

    sql += `
      GROUP BY se.unique_id, se.name, se.school, se.event, se.group_id
      ORDER BY total_score DESC
    `;

    const rows = await runQuery(sql, params);

    // Assign rank dynamically
    rows.forEach((row, idx) => {
      row.rank = idx + 1;
    });

    res.json(rows);
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/events - for event dropdown
router.get("/events", async (req, res) => {
  try {
    const rows = await db.query(
      "SELECT DISTINCT event FROM schoolevents ORDER BY event ASC"
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// GET /api/groups - all unique groups from schoolevents
router.get("/groups", async (req, res) => {
  try {
    const rows = await db.query(
      "SELECT DISTINCT group_id FROM schoolevents ORDER BY group_id ASC"
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

module.exports = router;
