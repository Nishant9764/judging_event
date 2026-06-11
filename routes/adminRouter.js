const express = require("express");
const adminRouter = express.Router();
const db = require("../config/db_admin"); // promise pool

adminRouter.get("/dashboard", async (req, res) => {
  try {
    const [[overviewRow]] = await db.query(`
      SELECT
        COUNT(DISTINCT SCHOOL) AS schools,
        COUNT(DISTINCT EVENT) AS events,
        COUNT(*) AS students
      FROM schoolevents
    `);
    const [students] = await db.query("SELECT * FROM schoolevents ORDER BY EVENT, NAME");

    // Fetch leaderboard results
    const [results] = await db.query(`
  SELECT 
    se.NAME AS student_name,
    se.SCHOOL AS school_name,
    se.EVENT AS event_name,
    se.GROUP_ID AS group_id,
    se.unique_id,

    COALESCE(SUM(ss.score), 0) AS final_score,

    DENSE_RANK() OVER (
      PARTITION BY se.EVENT 
      ORDER BY COALESCE(SUM(ss.score), 0) DESC
    ) AS \`rank\`

  FROM schoolevents se

  LEFT JOIN student_scores ss 
    ON ss.student_id = se.unique_id

  GROUP BY 
    se.unique_id,
    se.NAME,
    se.SCHOOL,
    se.EVENT,
    se.GROUP_ID

  ORDER BY 
    se.EVENT, \`rank\`
`);

    // Scoring stats
    const [[scoreStats]] = await db.query(`
      SELECT
        COUNT(DISTINCT student_id) AS judged_students
      FROM student_scores
    `).catch(() => [[{ judged_students: 0 }]]);

    const total_students = overviewRow.students || 0;
    const judged_students = scoreStats ? scoreStats.judged_students : 0;
    const completion_pct = total_students > 0 ? Math.round((judged_students / total_students) * 100) : 0;

    res.render("admin", {
      stats: {
        ...overviewRow,
        total_students,
        judged_students,
        completion_pct,
      },
      students,
      results: results || [],
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).send("Error loading dashboard");
  }
});

const adminController = require("../controllers/adminController");
adminRouter.post("/update-status", adminController.updateStudentStatus);

module.exports = adminRouter;
