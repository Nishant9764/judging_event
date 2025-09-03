// routes/dashboard-stats.js
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin"); // your existing DB pool (mysql2/promise)

/** helper that assumes mysql2/promise pool returning [rows, fields] */
async function runQuery(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * GET /api/dashboard-stats
 * returns JSON: { total_students, judged_students, completion }
 */
router.get("/dashboard-stats", async (req, res) => {
  try {
    // total students
    const totalRows = await runQuery(
      "SELECT COUNT(*) AS total_students FROM schoolevents"
    );
    const total_students = Number(totalRows[0]?.total_students || 0);

    // judged students (distinct student_id in student_scores)
    const judgedRows = await runQuery(
      "SELECT COUNT(DISTINCT student_id) AS judged_students FROM student_scores"
    );
    const judged_students = Number(judgedRows[0]?.judged_students || 0);

    // completion %
    const completion =
      total_students === 0
        ? 0
        : Math.round((judged_students / total_students) * 100);

    // respond JSON (always)
    return res.json({ total_students, judged_students, completion });
  } catch (err) {
    console.error("[/api/dashboard-stats] ERROR:", err);
    // always return well-formed JSON so frontend won't try to parse HTML
    return res.status(500).json({
      total_students: 0,
      judged_students: 0,
      completion: 0,
      error: "Server error - see server logs",
    });
  }
});

module.exports = router;
