// routes/leaderboardRouter.js — Production Grade
"use strict";
const express = require("express");
const router = express.Router();
const db = require("../config/db_admin");

// GET /api/leaderboard
// Query params: event (event name), group_id, school
router.get("/leaderboard", async (req, res) => {
  try {
    const { event, group_id, school } = req.query;

    let sql = `
      SELECT
        se.unique_id,
        se.NAME      AS student_name,
        se.SCHOOL    AS school_name,
        se.EVENT     AS event_name,
        se.GROUP_ID  AS group_id,
        COALESCE(SUM(ss.score), 0) AS total_score,
        DENSE_RANK() OVER (
          PARTITION BY se.EVENT
          ORDER BY COALESCE(SUM(ss.score), 0) DESC
        ) AS \`rank\`
      FROM schoolevents se
      INNER JOIN student_scores ss ON se.unique_id = ss.student_id
      WHERE 1=1
    `;
    const params = [];

    if (event) {
      sql += " AND LOWER(TRIM(se.EVENT)) = LOWER(TRIM(?))";
      params.push(event);
    }
    if (group_id) {
      sql += " AND se.GROUP_ID = ?";
      params.push(group_id);
    }
    if (school) {
      sql += " AND LOWER(TRIM(se.SCHOOL)) = LOWER(TRIM(?))";
      params.push(school);
    }

    sql += `
      GROUP BY se.unique_id, se.NAME, se.SCHOOL, se.EVENT, se.GROUP_ID
      ORDER BY se.EVENT, \`rank\`
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows || []);
  } catch (err) {
    console.error("leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/events — distinct event names
router.get("/events", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT EVENT AS event FROM schoolevents WHERE EVENT IS NOT NULL ORDER BY EVENT ASC"
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// GET /api/groups — distinct group IDs
router.get("/groups", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT GROUP_ID AS group_id FROM schoolevents WHERE GROUP_ID IS NOT NULL ORDER BY GROUP_ID ASC"
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// GET /api/schools — distinct schools (new endpoint for leaderboard filter)
router.get("/schools", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT SCHOOL AS school FROM schoolevents WHERE SCHOOL IS NOT NULL ORDER BY SCHOOL ASC"
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch schools" });
  }
});

module.exports = router;
