const express = require("express");
const app = express();
const session = require("express-session");
const path = require("path");
const db = require("./db");
const adminRouter = require("./routes/adminRouter");
const judgeRouter = require("./routes/judgeRouter");
const assignJudgeRoutes = require("./routes/assignJudgesRouter");
const adminDashboardRoutes = require("./routes/adminDashboardRouter");
const adminRoutes = require("./routes/admin");
const roomRoutes = require("./routes/roomsRouter");
const apiRoutes = require("./routes/dashboard-stats");
const leaderboardRoutes = require("./routes/leaderboardRouter");
const util = require("util");
const query = util.promisify(db.query).bind(db);
const bcrypt = require("bcrypt");

let port = 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("landingPage.ejs");
});

app.post("/home", (req, res) => {
  res.render("home.ejs");
});

app.use("/admin", adminRoutes);
app.use(adminDashboardRoutes);

app.use(
  session({
    secret: "1$!086543!3537@#mbwhf&hd#$",
    resave: false,
    saveUninitialized: true,
  })
);

function generateRandomString(length = 10) {
  return Math.random().toString(36).substr(2, length); // e.g., 'a8k3jf0b'
}

// Login POST
app.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  db.query(
    "SELECT * FROM users WHERE name=? AND role=?",
    [username, role],
    async (err, results) => {
      if (err) throw err;

      if (results.length > 0) {
        const user = results[0];

        let isValid = false;

        if (role === "Administrator") {
          // Plain-text comparison for admin
          isValid = password === user.password;
        } else {
          // Compare hashed password for judges
          isValid = await bcrypt.compare(password, user.password);
        }

        if (isValid) {
          req.session.user = user;
          const randomId = generateRandomString();

          if (role === "Administrator")
            return res.redirect(`/admin/dashboard?id=${randomId}`);
          else return res.redirect(`/judge/dashboard?id=${randomId}`);
        }
      }

      // If no user found or password doesn't match
      res.render("home", { error: "Invalid credentials or role mismatch" });
    }
  );
});

app.use("/admin", adminRouter);
app.use("/judge", judgeRouter);

app.use("/api", apiRoutes);
app.use("/api", leaderboardRoutes);

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.use("/api", require("./routes/judgeApiRouter"));

app.post("/api/assign-room", async (req, res) => {
  try {
    const { studentName, room } = req.body;
    const sql = "UPDATE SchoolEvents SET room = ? WHERE NAME = ?";

    // ✅ Use await with your new promisified 'query' function
    // Note: We don't destructure here, as promisify returns the 'results' object directly.
    const result = await query(sql, [room, studentName]);

    if (result.affectedRows > 0) {
      res.json({ success: true, message: "Room assigned successfully!" });
    } else {
      res.status(404).json({ success: false, message: "Student not found." });
    }
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.get("/*splat", (req, res) => {
  res.render("404.ejs");
});

// --- API Endpoint to Assign a Room ---
app.post("/api/assign-room", async (req, res) => {
  const { studentName, room } = req.body;

  // 2. Add validation for the student's name.
  if (!studentName) {
    return res
      .status(400)
      .json({ success: false, message: "Student name is required." });
  }

  try {
    // 3. Prepare and execute the SQL UPDATE query using the student's name.
    const sql = "UPDATE SchoolEvents SET room = ? WHERE NAME = ?";
    const [result] = await db.execute(sql, [room, studentName]);

    if (result.affectedRows > 0) {
      // 4. Send a success response. The log message is also clearer now.
      console.log(
        `Successfully assigned Room "${room}" to Student: ${studentName}`
      );
      res.json({ success: true, message: "Room assigned successfully!" });
    } else {
      // 5. Send an error if no student with that name was found.
      res.status(404).json({
        success: false,
        message: `Student "${studentName}" not found. `,
      });
    }
  } catch (error) {
    // 6. Handle any potential database errors.
    console.error("Database error:", error);
    res.status(500).json({ success: false, message: "Assigned." });
  }
});

app.use(assignJudgeRoutes);
app.use(roomRoutes);

app.listen(port, () => {
  console.log(`Server running on port: http://localhost:${port}`);
});
