// services/emailService.js — Production Grade
"use strict";
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT || 587),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── ISKCON-themed password generator ────────────────────────────────────────
const DIVINE_NAMES = [
  "Krishna",
  "Radha",
  "Jagannath",
  "Prabhupada",
  "Baladev",
  "Subhadra",
  "Rajapur",
  "Nandotsav",
];
const SYMBOLS = "!@#$%^&*";

function generatePassword() {
  const name = DIVINE_NAMES[Math.floor(Math.random() * DIVINE_NAMES.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  return `${name}${num}${sym}`;
}

// ── Professional HTML email template ────────────────────────────────────────
function buildCredentialsEmail({
  username,
  password,
  roomNumber,
  eventName,
  judgeEmail,
}) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Judge Credentials – ISKCON NRJD</title>
</head>
<body style="margin:0;padding:0;background:#0f0720;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0720;padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1a2e;border-radius:20px;overflow:hidden;border:1px solid rgba(249,115,22,.2)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#f97316,#eab308);padding:36px 40px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">🙏</div>
          <h1 style="margin:0;font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:700;color:#1a0a2e;letter-spacing:.5px">ISKCON NRJD Nandotsav</h1>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(26,10,46,.75)">Judge Credentials — Confidential</p>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:36px 40px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f1f5">Hare Krishna, ${username}!</p>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,.6);line-height:1.7">
            You have been assigned as a judge for <strong style="color:#fdba74">${
              eventName || "your assigned event"
            }</strong>${
    roomNumber
      ? ` in <strong style="color:#fdba74">Room ${roomNumber}</strong>`
      : ""
  }.<br/>
            Your login credentials are provided below. Please keep them secure.
          </p>
        </td></tr>

        <!-- Credentials Card -->
        <tr><td style="padding:28px 40px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.25);border-radius:14px;overflow:hidden">
            <tr><td style="padding:18px 24px;border-bottom:1px solid rgba(249,115,22,.15)">
              <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.4)">Username</p>
              <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#fdba74;font-family:monospace">${username}</p>
            </td></tr>
            <tr><td style="padding:18px 24px">
              <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.4)">Password</p>
              <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#fdba74;font-family:monospace">${password}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Login Link -->
        <tr><td style="padding:0 40px 28px;text-align:center">
          <a href="${
            process.env.APP_URL || "http://localhost:8080"
          }/login" style="display:inline-block;background:linear-gradient(135deg,#f97316,#eab308);color:#1a0a2e;text-decoration:none;font-weight:700;font-size:14px;padding:13px 32px;border-radius:50px;letter-spacing:.3px">
            Sign In to Judge Panel →
          </a>
        </td></tr>

        <!-- Steps -->
        <tr><td style="padding:0 40px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.04);border-radius:12px;padding:18px 20px;border:1px solid rgba(255,255,255,.06)">
            <tr><td>
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:rgba(255,255,255,.8)">Quick Start Guide:</p>
              <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,.55)">1. Visit the Judge Panel link above</p>
              <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,.55)">2. Select <strong style="color:#fdba74">Judge</strong> as your role</p>
              <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,.55)">3. Enter your username and password</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">4. Start scoring your assigned event</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Warning -->
        <tr><td style="padding:0 40px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px">
            <tr><td style="padding:14px 18px">
              <p style="margin:0;font-size:12px;color:rgba(239,68,68,.9);line-height:1.6">
                <strong>Security Notice:</strong> Do not share your credentials with anyone. If you experience any issues, please contact the admin directly. Do not reply to this email.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,.06);text-align:center">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:rgba(255,255,255,.5)">ISKCON NRJD Nandotsav ${year}</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,.3);font-style:italic">
            Hare Krishna Hare Krishna · Krishna Krishna Hare Hare · Hare Rama Hare Rama · Rama Rama Hare Hare
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:rgba(255,255,255,.2)">
            This is an automated message. Please do not reply to this email.<br/>
            For assistance, contact the event administrator.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send judge credentials email ──────────────────────────────────────────────
async function sendJudgeCredentials({
  email,
  username,
  password,
  roomNumber,
  eventName,
}) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
      "[EmailService] EMAIL_USER/EMAIL_PASS not set — skipping email."
    );
    return { sent: false, reason: "Email not configured" };
  }
  try {
    const fromName = process.env.EMAIL_FROM_NAME || "ISKCON NRJD Nandotsav";
    const fromAddr = process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: email,
      subject: `Your Judge Credentials – ISKCON NRJD Nandotsav`,
      html: buildCredentialsEmail({
        username,
        password,
        roomNumber,
        eventName,
        judgeEmail: email,
      }),
      // Plain text fallback
      text: `Hare Krishna ${username}!\n\nYour judge credentials:\nUsername: ${username}\nPassword: ${password}\n\nLogin: ${
        process.env.APP_URL || "http://localhost:8080"
      }/login\n\nHare Krishna!`,
    });

    console.log(`[EmailService] Credentials sent to ${email}`);
    return { sent: true };
  } catch (err) {
    console.error("[EmailService] Failed:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { generatePassword, sendJudgeCredentials };
