const express = require("express");
const adminRouter = express.Router();
const db = require("../db");
const adminController = require("../controllers/adminController");

// Middleware to protect admin routes
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "Administrator") {
    return next();
  }
  res.render("404", { error: "Access denied. Please login as Admin." });
}

adminRouter.get("/dashboard", (req, res) => {
  const overviewSql = `
    SELECT 
      COUNT(DISTINCT SCHOOL) as schools,
      COUNT(DISTINCT EVENT) as events,
      COUNT(*) as students
    FROM SchoolEvents
  `;
  const studentsSql = "SELECT * FROM SchoolEvents";

  // Run both queries
  db.query(overviewSql, (err, overviewResult) => {
    if (err) {
      console.error("Error fetching overview:", err);
      return res.status(500).send("Database error");
    }

    db.query(studentsSql, (err, studentsResult) => {
      if (err) {
        console.error("Error fetching students:", err);
        return res.status(500).send("Database error");
      }

      res.render("admin", {
        stats: overviewResult[0], // overview data
        students: studentsResult, // students table
      });
    });
  });
});

adminRouter.post("/update-status", adminController.updateStudentStatus);

module.exports = adminRouter;
