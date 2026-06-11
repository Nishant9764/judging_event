// server.js — Production Grade (complete file)
"use strict";
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const db = require("./config/db_admin");

// ── Routers ───────────────────────────────────────────────────────────────────
const adminRouter = require("./routes/adminRouter");
const judgeRouter = require("./routes/judgeRouter");
const assignJudgesRouter = require("./routes/assignJudgesRouter"); // FIX: single router, no duplicates
const adminDashboardRouter = require("./routes/adminDashboardRouter"); // GET /admin/dashboard-data
const adminRoutes = require("./routes/admin");
const roomRoutes = require("./routes/roomsRouter");
const dashboardStatsRoutes = require("./routes/dashboard-stats");
const leaderboardRoutes = require("./routes/leaderboardRouter");
const csvRouter = require("./routes/csvRouter");
const judgeApiRouter = require("./routes/judgeApiRouter"); // All /api/judge endpoints
const communicationsRouter = require("./routes/communicationsRouter"); // Announcements, help, messages, room close

const PORT = process.env.PORT || 8080;

// ── Middleware ────────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "iskcon_nrjd_secret_change_in_prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in prod (HTTPS)
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// ── Auth helpers ──────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.user?.role === "Administrator") return next();
  res.redirect("/login");
}
function requireJudge(req, res, next) {
  if (req.session.user?.role === "Judge") return next();
  res.redirect("/login");
}

// ── Public routes ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.render("landingPage"));
app.get("/login", (req, res) => res.render("home", { error: null }));

// ── Login ─────────────────────────────────────────────────────────────────────
app.post("/login", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.render("home", { error: "All fields are required." });
  }

  try {
    const [results] = await db.query(
      "SELECT * FROM users WHERE name = ? AND role = ?",
      [username.trim(), role]
    );

    if (!results.length) {
      return res.render("home", { error: "Invalid credentials or role." });
    }

    const user = results[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.render("home", { error: "Invalid credentials or role." });
    }

    // Refresh session user object from DB to always get latest room_id etc.
    req.session.user = user;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.render("home", { error: "Session error." });
      }
      const id = Math.random().toString(36).substr(2, 10);
      return res.redirect(
        role === "Administrator"
          ? `/admin/dashboard?id=${id}`
          : `/judge/dashboard?id=${id}`
      );
    });
  } catch (err) {
    console.error("Login error:", err);
    res.render("home", { error: "Server error. Please try again." });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use("/admin", requireAdmin, adminRouter);
app.use("/admin", requireAdmin, csvRouter);
app.use(adminDashboardRouter); // GET /admin/dashboard-data (has its own requireAdmin)
app.use("/admin", adminRoutes);

// ── Judge routes ──────────────────────────────────────────────────────────────
app.use("/judge", judgeRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", dashboardStatsRoutes);
app.use("/api", leaderboardRoutes);
app.use("/api", judgeApiRouter); // parameters, students-by-room-event, submit-score, close-room
app.use("/api", communicationsRouter); // announcements, help-requests, messages, admin-close-room

// ── Room assignment (student table) ──────────────────────────────────────────
app.use(assignJudgesRouter); 
app.use(assignJudgesRouter);

// ── Room creation ─────────────────────────────────────────────────────────────
app.use(roomRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render("404"));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
  try {
    const seedAdmin = require("./seed");
    await seedAdmin();
  } catch (_) {}
});
