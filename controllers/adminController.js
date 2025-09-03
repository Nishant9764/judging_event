const db = require("../config/db_admin.js");

exports.updateStudentStatus = (req, res) => {
  // 1. Receive all three pieces of data from the request body
  const { studentName, isSelected, uniqueId } = req.body;

  // Optional: Log what the server receives for debugging
  console.log("Received data on server:", req.body);

  if (!studentName) {
    return res.status(400).json({ message: "Student name is required." });
  }

  // 2. Update the SQL query to set both the 'is_selected' and 'unique_id' columns
  const sql =
    "UPDATE schoolevents SET is_selected = ?, unique_id = ? WHERE NAME = ?";

  // 3. Pass all three values into the query parameters in the correct order
  db.query(sql, [isSelected, uniqueId, studentName], (err, result) => {
    if (err) {
      console.error("Database update error:", err);
      return res.status(500).json({ message: "Error updating database." });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Student not found in the database." });
    }

    res.status(200).json({ message: "Status and ID updated successfully." });
  });
};
