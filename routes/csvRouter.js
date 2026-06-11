// routes/csvRouter.js — Admin CSV Upload for Students
const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const db = require("../config/db_admin");

// Memory storage — we process the buffer directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.originalname.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed."));
    }
  },
});

// Required columns (case-insensitive matching)
const REQUIRED_COLS = ["SCHOOL", "GROUP_ID", "EVENT", "CLASS", "SEC", "NAME"];

router.post("/upload-csv", upload.single("csvFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded." });
  }

  const rows = [];
  const errors = [];

  try {
    // Parse CSV from buffer
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString("utf8"));
      stream
        .pipe(csv())
        .on("headers", (headers) => {
          const upperHeaders = headers.map((h) => h.trim().toUpperCase());
          const missing = REQUIRED_COLS.filter(
            (col) => !upperHeaders.includes(col)
          );
          if (missing.length > 0) {
            reject(
              new Error(`Missing required columns: ${missing.join(", ")}`)
            );
          }
        })
        .on("data", (row) => {
          // Normalize keys to uppercase
          const normalized = {};
          Object.keys(row).forEach((k) => {
            normalized[k.trim().toUpperCase()] = (row[k] || "").trim();
          });
          rows.push(normalized);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const { SCHOOL, GROUP_ID, EVENT, CLASS, SEC, NAME } = row;
      if (!NAME || !EVENT) {
        errors.push(`Skipped row: NAME or EVENT missing.`);
        skipped++;
        continue;
      }

      // Generate unique_id
      const unique_id = `${(SCHOOL || "SCH").substring(0, 4).toUpperCase()}-${
        GROUP_ID || "GRP"
      }-${NAME.replace(/\s+/g, "").substring(0, 6).toUpperCase()}-${uuidv4()
        .split("-")[0]
        .toUpperCase()}`;

      try {
        await db.query(
          `INSERT INTO schoolevents (SCHOOL, GROUP_ID, EVENT, CLASS, SEC, NAME, unique_id, room, is_selected)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)
           ON DUPLICATE KEY UPDATE
             SCHOOL = VALUES(SCHOOL),
             GROUP_ID = VALUES(GROUP_ID),
             EVENT = VALUES(EVENT),
             CLASS = VALUES(CLASS),
             SEC = VALUES(SEC)`,
          [SCHOOL, GROUP_ID, EVENT, CLASS, SEC, NAME, unique_id]
        );
        inserted++;
      } catch (dbErr) {
        errors.push(`Row "${NAME}": ${dbErr.message}`);
        skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${inserted} inserted, ${skipped} skipped.`,
      inserted,
      skipped,
      errors: errors.slice(0, 20), // limit error list
    });
  } catch (err) {
    console.error("CSV upload error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
