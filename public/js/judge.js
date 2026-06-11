// public/js/judge.js — Production Grade (Complete + Premium Dashboard)
// EXISTING CODE UNCHANGED. New functions added at the bottom.
"use strict";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dashboardView = document.getElementById("dashboard-view");
const scoringView = document.getElementById("scoring-view");
const scoringEventTitle = document.getElementById("scoring-event-title");
const scoringEventSubtitle = document.getElementById("scoring-event-subtitle");
const studentListUl = document.getElementById("student-list-ul");
const studentListHeader = document.getElementById("student-list-header");
const studentProgressBar = document.getElementById("student-progress-bar");
const studentProgressText = document.getElementById("student-progress-text");
const scoringPanel = document.getElementById("scoring-panel");

// ── State ─────────────────────────────────────────────────────────────────────
let currentEvent = null;
let currentStudent = null;
let livePollingInterval = null;
let announcementInterval = null;
let msgPollingInterval = null;
let roomStatusInterval = null;
let lastAnnouncementId = 0;
let lastHelpThrottle = 0;
let unsavedScoreWarning = false;
let roomIsClosed = false;

// ── Audio ─────────────────────────────────────────────────────────────────────
function playTone(freq, duration, type = "sine") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}
function playSuccess() {
  playTone(660, 0.15);
  setTimeout(() => playTone(880, 0.25), 160);
}
function playUrgent() {
  [660, 880, 1100].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.18), i * 170)
  );
}
function playNotification() {
  playTone(550, 0.2);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = "info", duration = 3500) {
  let container = document.getElementById("judge-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "judge-toast-container";
    container.style.cssText =
      "position:fixed;bottom:90px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(container);
  }
  const colors = {
    info: "#1e293b",
    success: "#16a34a",
    error: "#dc2626",
    warn: "#b45309",
  };
  const toast = document.createElement("div");
  toast.style.cssText = `background:${
    colors[type] || colors.info
  };color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .25s;max-width:300px;line-height:1.4;pointer-events:auto;`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function safeFetchJson(url, opts = {}) {
  const res = await fetch(url, { credentials: "same-origin", ...opts });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Invalid JSON from server");
  }
}

function genStudentId(s, idx) {
  return s.unique_id || s.id || `__idx_${idx}`;
}

function escapeHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

// ── URL management ────────────────────────────────────────────────────────────
function pushScoringUrl(roomNumber, eventName) {
  try {
    const url = `/judge/score/${encodeURIComponent(
      roomNumber
    )}/${encodeURIComponent(eventName)}`;
    window.history.pushState({ scoring: true, roomNumber, eventName }, "", url);
  } catch (_) {}
}
function pushDashboardUrl() {
  try {
    window.history.pushState({ scoring: false }, "", "/judge/dashboard");
  } catch (_) {}
}

window.addEventListener("popstate", (e) => {
  if (e.state && e.state.scoring) {
    startScoringByEvent("", e.state.eventName, e.state.roomNumber);
  } else {
    showDashboard(false);
  }
});

// ── Room closed guard ─────────────────────────────────────────────────────────
async function checkRoomStatus() {
  try {
    const data = await safeFetchJson("/api/judge-room-status");
    if (data.status === "closed" && !roomIsClosed) {
      roomIsClosed = true;
      if (scoringView && !scoringView.classList.contains("hidden")) {
        showRoomClosedInScoring();
      }
      updateRoomClosedBadge(true);
    }
    return data;
  } catch (_) {
    return null;
  }
}

function showRoomClosedInScoring() {
  if (!scoringPanel) return;
  scoringPanel.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:64px 24px;gap:16px;text-align:center">
      <div style="width:72px;height:72px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center">
        <svg width="32" height="32" fill="none" stroke="#dc2626" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <p style="font-size:18px;font-weight:700;color:#dc2626">Room Closed</p>
      <p style="font-size:13px;color:#64748b;max-width:320px">This room has been officially closed by the admin. Scoring is no longer available.</p>
      <button onclick="showDashboard()" style="margin-top:8px;padding:10px 24px;background:#1e293b;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Back to Dashboard</button>
    </div>`;
  const closeBtn = document.getElementById("close-room-btn");
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.textContent = "Room Closed";
  }
}

function updateRoomClosedBadge(closed) {
  document.querySelectorAll(".room-event-card").forEach((card) => {
    const badge = card.querySelector(".room-badge");
    const startBtn = card.querySelector(".btn-start-scoring");
    if (closed) {
      if (badge) {
        badge.textContent = "Closed";
        badge.style.cssText =
          "background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.25);color:#ef4444;";
      }
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "Room Closed";
        startBtn.style.cssText =
          "opacity:.5;cursor:not-allowed;background:#e2e8f0;color:#64748b;box-shadow:none;";
      }
    }
  });
  // Also update new-style start buttons
  document.querySelectorAll(".j-rc-btn-start").forEach((btn) => {
    if (closed) {
      btn.disabled = true;
      btn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/></svg> Locked`;
    }
  });
}

// ── Announcement banner ───────────────────────────────────────────────────────
function showAnnouncementBanner(ann) {
  // Original banner
  const banner = document.getElementById("announcement-banner");
  const text = document.getElementById("ann-text");
  if (banner && text) {
    text.textContent = `${ann.priority === "urgent" ? "URGENT" : "Notice"} — ${
      ann.created_by || "Admin"
    }: ${ann.message}`;
    banner.className = ann.priority === "urgent" ? "urgent" : "normal";
    banner.style.display = "block";
  }
  // New premium banner
  const jBanner = document.getElementById("j-ann-banner");
  const jText = document.getElementById("j-ann-text");
  if (jBanner && jText) {
    jText.textContent =
      (ann.priority === "urgent" ? "🚨 URGENT: " : "📢 ") + ann.message;
    jBanner.className =
      "j-ann-visible" + (ann.priority === "urgent" ? " j-ann-urgent" : "");
  }
  if (ann.priority === "urgent") playUrgent();
  else playNotification();
}

window.dismissAnnouncement = function () {
  const el = document.getElementById("announcement-banner");
  if (el) el.style.display = "none";
};

async function pollAnnouncements() {
  try {
    const data = await safeFetchJson("/api/announcements");
    if (!data || !data.length) {
      const el = document.getElementById("announcement-banner");
      if (el) el.style.display = "none";
      const jb = document.getElementById("j-ann-banner");
      if (jb) jb.classList.remove("j-ann-visible", "j-ann-urgent");
      return;
    }
    const latest = data[0];
    if (latest.id !== lastAnnouncementId) {
      lastAnnouncementId = latest.id;
      showAnnouncementBanner(latest);
    }
  } catch (_) {}
}

// ── Help system (original modal) ──────────────────────────────────────────────
const helpBtn = document.getElementById("help-float-btn");
const helpModal = document.getElementById("help-modal");
const helpCancel = document.getElementById("help-cancel-btn");
const helpSend = document.getElementById("help-send-btn");
const helpInput = document.getElementById("help-msg-input");

helpBtn?.addEventListener("click", () => {
  helpModal?.classList.add("open");
  helpInput?.focus();
});
helpCancel?.addEventListener("click", () =>
  helpModal?.classList.remove("open")
);
helpModal?.addEventListener("click", (e) => {
  if (e.target === helpModal) helpModal.classList.remove("open");
});

helpSend?.addEventListener("click", async () => {
  const now = Date.now();
  if (now - lastHelpThrottle < 30000) {
    showToast("Please wait 30s before sending another request.", "warn");
    return;
  }
  const msg = helpInput?.value.trim() || "I need help!";
  helpSend.disabled = true;
  helpSend.textContent = "Sending...";
  try {
    await safeFetchJson("/api/help-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    lastHelpThrottle = now;
    showToast("Help request sent to admin!", "success");
    helpModal?.classList.remove("open");
    if (helpInput) helpInput.value = "";
    playSuccess();
  } catch (err) {
    showToast("Failed to send: " + err.message, "error");
  } finally {
    helpSend.disabled = false;
    helpSend.textContent = "Send Request";
  }
});

// ── Message drawer (original) ─────────────────────────────────────────────────
const msgDrawer = document.getElementById("msg-drawer");
const openMsgBtn = document.getElementById("open-msg-btn");
const closeMsgBtn = document.getElementById("close-msg-btn");
const msgList = document.getElementById("msg-list");
const msgInput = document.getElementById("msg-input");
const msgSendBtn = document.getElementById("msg-send-btn");
const msgBadgeEl = document.getElementById("msg-badge");

openMsgBtn?.addEventListener("click", async () => {
  msgDrawer?.classList.add("open");
  await loadMessages();
  await safeFetchJson("/api/messages/read", { method: "PUT" }).catch(() => {});
  updateMsgBadge(0);
});
closeMsgBtn?.addEventListener("click", () =>
  msgDrawer?.classList.remove("open")
);

async function loadMessages() {
  if (!msgList) return;
  try {
    const msgs = await safeFetchJson("/api/messages");
    if (!msgs || !msgs.length) {
      msgList.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">No messages yet.<br>Admin will respond here.</div>`;
      return;
    }
    msgList.innerHTML = "";
    msgs.forEach((m) => {
      const isMe = m.from_role === "Judge";
      const div = document.createElement("div");
      div.className = `msg-bubble ${isMe ? "from-me" : "from-admin"}`;
      div.innerHTML = `<div>${escapeHtml(
        m.body
      )}</div><div class="msg-meta">${escapeHtml(
        isMe ? "You" : m.from_name
      )} · ${formatTime(m.created_at)}</div>`;
      msgList.appendChild(div);
    });
    msgList.scrollTop = msgList.scrollHeight;
  } catch (_) {}
}

async function sendMessage() {
  const body = msgInput?.value.trim();
  if (!body) return;
  if (msgSendBtn) msgSendBtn.disabled = true;
  try {
    await safeFetchJson("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (msgInput) msgInput.value = "";
    await loadMessages();
  } catch (err) {
    showToast("Failed to send: " + err.message, "error");
  } finally {
    if (msgSendBtn) msgSendBtn.disabled = false;
  }
}

msgSendBtn?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function updateMsgBadge(n) {
  if (!msgBadgeEl) return;
  msgBadgeEl.textContent = n;
  msgBadgeEl.style.display = n > 0 ? "flex" : "none";
  // Also update sidebar badge
  const sbBadge = document.getElementById("jSbMsgCount");
  if (sbBadge) {
    sbBadge.textContent = n;
    sbBadge.style.display = n > 0 ? "inline-flex" : "none";
  }
}

async function pollMessages() {
  try {
    const data = await safeFetchJson("/api/messages/unread");
    const count = data ? Number(data.unread || 0) : 0;
    const prev = Number(msgBadgeEl?.textContent || 0);
    if (count > prev) playNotification();
    updateMsgBadge(count);
    if (msgDrawer?.classList.contains("open")) await loadMessages();
    // Also refresh sidebar messages
    jSbLoadMessages();
  } catch (_) {}
}

// ── Back + Close room buttons ─────────────────────────────────────────────────
const backBtn = document.getElementById("back-to-dashboard");
const closeBtn = document.getElementById("close-room-btn");

backBtn?.addEventListener("click", () => {
  if (
    unsavedScoreWarning &&
    !confirm("You have unsaved scores. Go back anyway?")
  )
    return;
  showDashboard();
});

closeBtn?.addEventListener("click", async () => {
  if (
    !confirm(
      "Mark your scoring as complete?\nAdmin will be notified to officially close the room."
    )
  )
    return;
  closeBtn.disabled = true;
  closeBtn.textContent = "Submitting...";
  try {
    const data = await safeFetchJson("/api/close-room", { method: "POST" });
    if (data && data.redirect) {
      playSuccess();
      window.location.href = data.redirect;
    } else {
      showToast(data?.message || "Done.", "success");
    }
  } catch (err) {
    showToast("Failed: " + err.message, "error");
    closeBtn.disabled = false;
    closeBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close Room`;
  }
});

// ── Start Scoring ─────────────────────────────────────────────────────────────
async function startScoringByEvent(eventId, eventName, roomNumber) {
  if (!eventName || eventName === "undefined") {
    showToast("Event name missing. Contact admin.", "error");
    return;
  }
  if (!roomNumber || roomNumber === "undefined") {
    showToast("Room number missing. Contact admin.", "error");
    return;
  }

  const status = await checkRoomStatus();
  if (status && status.status === "closed") {
    showToast("This room has been closed. Scoring is not allowed.", "error");
    updateRoomClosedBadge(true);
    return;
  }

  pushScoringUrl(roomNumber, eventName);

  dashboardView?.classList.add("hidden");
  scoringView?.classList.remove("hidden");
  scoringView?.classList.add("visible");
  if (scoringEventTitle) scoringEventTitle.textContent = eventName;
  if (scoringEventSubtitle)
    scoringEventSubtitle.textContent = `Room: ${roomNumber} · Loading...`;
  if (scoringPanel)
    scoringPanel.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:64px;gap:16px;color:#64748b">
      <div class="spin-loader"></div>
      <p style="font-size:14px;font-weight:500">Loading students for <strong>${escapeHtml(
        eventName
      )}</strong>...</p>
    </div>`;

  try {
    const [params, students] = await Promise.all([
      safeFetchJson(`/api/parameters/${encodeURIComponent(eventName)}`),
      safeFetchJson(
        `/api/students-by-room-event/${encodeURIComponent(
          roomNumber
        )}/${encodeURIComponent(eventName)}`
      ),
    ]);

    const normalized = (students || []).map((s, idx) => ({
      unique_id: genStudentId(s, idx),
      name: s.name || s.NAME || "Unknown",
      school: s.school || s.SCHOOL || "",
      group_id: s.group_id || s.GROUP_ID || "",
      scored: !!s.scored,
      scores: {},
      comments: s.comments || "",
    }));

    currentEvent = {
      id: eventId,
      title: eventName,
      roomNumber: roomNumber,
      parameters: (params || []).map((p) => ({
        parameter_id: p.parameter_id,
        parameter_name: p.parameter_name,
        max_score: Number(p.max_score || 10),
      })),
      students: normalized,
    };

    if (scoringEventSubtitle) {
      scoringEventSubtitle.textContent = `Room: ${roomNumber} · ${
        normalized.length
      } student${normalized.length !== 1 ? "s" : ""}`;
    }

    populateStudentList();

    if (!params || params.length === 0) {
      showToast(
        `No scoring parameters for "${eventName}". Ask admin to add them.`,
        "warn",
        6000
      );
    }

    if (normalized.length === 0) {
      scoringPanel.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:64px;gap:12px;text-align:center">
          <svg width="56" height="56" fill="none" stroke="#cbd5e1" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <p style="font-size:16px;font-weight:600;color:#374151">No students found</p>
          <p style="font-size:13px;color:#64748b">No students assigned to <strong>${escapeHtml(
            roomNumber
          )}</strong> for <strong>${escapeHtml(eventName)}</strong>.</p>
          <button onclick="startScoringByEvent('${escapeHtml(
            eventId || ""
          )}','${escapeHtml(eventName)}','${escapeHtml(
        roomNumber
      )}')" style="margin-top:12px;padding:8px 20px;background:#1e293b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Retry</button>
        </div>`;
    } else {
      const first = normalized.find((s) => !s.scored);
      if (first) {
        renderScoringPanel(first.unique_id);
      } else {
        scoringPanel.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;padding:64px;gap:12px;text-align:center">
            <svg width="56" height="56" fill="none" stroke="#16a34a" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <p style="font-size:18px;font-weight:700;color:#16a34a">All students scored!</p>
            <p style="font-size:13px;color:#64748b">You can select any student to review or edit scores.</p>
          </div>`;
      }
    }

    if (livePollingInterval) clearInterval(livePollingInterval);
    livePollingInterval = setInterval(pollStudentsAndParameters, 5000);
    unsavedScoreWarning = false;
  } catch (err) {
    console.error("startScoringByEvent failed:", err);
    scoringPanel.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:64px;gap:12px;text-align:center;color:#dc2626">
        <svg width="48" height="48" fill="none" stroke="#dc2626" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p style="font-size:16px;font-weight:600">Failed to load event data</p>
        <p style="font-size:13px">${escapeHtml(err.message)}</p>
        <button onclick="showDashboard()" style="margin-top:12px;padding:8px 20px;background:#1e293b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Back</button>
      </div>`;
  }
}

// ── Live polling ──────────────────────────────────────────────────────────────
async function pollStudentsAndParameters() {
  if (!currentEvent) return;
  try {
    const [studentsRaw, paramsRaw] = await Promise.all([
      safeFetchJson(
        `/api/students-by-room-event/${encodeURIComponent(
          currentEvent.roomNumber
        )}/${encodeURIComponent(currentEvent.title)}`
      ),
      safeFetchJson(
        `/api/parameters/${encodeURIComponent(currentEvent.title)}`
      ),
    ]);

    currentEvent.students = (studentsRaw || []).map((s, idx) => {
      const uid = genStudentId(s, idx);
      const existing = currentEvent.students.find((x) => x.unique_id === uid);
      return {
        unique_id: uid,
        name: s.name || s.NAME || existing?.name || "Unknown",
        school: s.school || existing?.school || "",
        scored: !!s.scored,
        scores: existing?.scores || {},
        comments: existing?.comments || "",
      };
    });

    const newParams = (paramsRaw || []).map((p) => ({
      parameter_id: p.parameter_id,
      parameter_name: p.parameter_name,
      max_score: Number(p.max_score || 10),
    }));
    if (JSON.stringify(newParams) !== JSON.stringify(currentEvent.parameters)) {
      currentEvent.parameters = newParams;
    }

    populateStudentList();

    if (currentStudent) {
      const still = currentEvent.students.find(
        (s) => s.unique_id === currentStudent.unique_id
      );
      if (!still && currentEvent.students[0])
        renderScoringPanel(currentEvent.students[0].unique_id);
    }
  } catch (_) {}
}

// ── Student sidebar ───────────────────────────────────────────────────────────
function populateStudentList() {
  if (!studentListUl || !currentEvent) return;
  const students = currentEvent.students || [];
  if (studentListHeader)
    studentListHeader.textContent = `Students (${students.length})`;
  studentListUl.innerHTML = "";

  students.forEach((s) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const isActive = currentStudent && currentStudent.unique_id === s.unique_id;
    btn.className =
      "student-list-btn" +
      (isActive ? " active" : "") +
      (s.scored ? " scored" : "");
    btn.dataset.studentId = s.unique_id;
    btn.innerHTML = `
      <span class="slist-icon">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </span>
      <span class="slist-name">${escapeHtml(s.name)}</span>
      ${
        s.scored
          ? `<span class="slist-check"><svg width="14" height="14" fill="none" stroke="#16a34a" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>`
          : ""
      }`;
    btn.addEventListener("click", () =>
      renderScoringPanel(btn.dataset.studentId)
    );
    li.appendChild(btn);
    studentListUl.appendChild(li);
  });
  updateStudentProgress();
}

function updateStudentListActiveState() {
  studentListUl?.querySelectorAll(".student-list-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      !!(currentStudent && btn.dataset.studentId === currentStudent.unique_id)
    );
  });
}

function updateStudentProgress() {
  if (!currentEvent) return;
  const total = currentEvent.students.length;
  const scored = currentEvent.students.filter((s) => s.scored).length;
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  if (studentProgressBar) studentProgressBar.style.width = pct + "%";
  if (studentProgressText)
    studentProgressText.textContent = `${scored}/${total} scored (${pct}%)`;
}

// ── Scoring panel ─────────────────────────────────────────────────────────────
async function renderScoringPanel(studentUniqueId) {
  if (!currentEvent || !scoringPanel) return;
  const student = currentEvent.students.find(
    (s) => s.unique_id === studentUniqueId
  );
  if (!student) return;

  if (student.scored && Object.keys(student.scores).length === 0) {
    scoringPanel.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:48px;gap:12px;color:#64748b"><div class="spin-loader"></div><span>Loading scores...</span></div>`;
    try {
      student.scores = await safeFetchJson(
        `/api/student-scores/${encodeURIComponent(
          student.unique_id
        )}/${encodeURIComponent(currentEvent.title)}`
      );
    } catch (err) {
      showToast("Could not load prior scores: " + err.message, "warn");
    }
  }

  currentEvent.parameters.forEach((p) => {
    if (student.scores[p.parameter_id] === undefined)
      student.scores[p.parameter_id] = 0;
  });

  currentStudent = student;
  updateStudentListActiveState();
  scoringPanel.innerHTML = "";

  const idx = currentEvent.students.findIndex(
    (s) => s.unique_id === studentUniqueId
  );
  const totalNow = currentEvent.parameters.reduce(
    (a, p) => a + Number(student.scores[p.parameter_id] || 0),
    0
  );

  const header = document.createElement("div");
  header.className = "score-panel-header";
  header.innerHTML = `
    <div class="sph-left">
      <div class="sph-avatar">${escapeHtml(
        student.name.charAt(0).toUpperCase()
      )}</div>
      <div>
        <h3 class="sph-name">${escapeHtml(student.name)}</h3>
        <p class="sph-meta">${escapeHtml(student.school || "")}${
    student.group_id ? " · Group " + escapeHtml(student.group_id) : ""
  }${idx >= 0 ? " · " + (idx + 1) + "/" + currentEvent.students.length : ""}</p>
      </div>
    </div>
    <div class="sph-total">
      <span class="sph-score" id="total-score">${totalNow}</span>
      <span class="sph-score-label">Total</span>
    </div>`;
  scoringPanel.appendChild(header);

  if (currentEvent.parameters.length === 0) {
    const warn = document.createElement("div");
    warn.className = "no-params-warn";
    warn.innerHTML = `<svg width="24" height="24" fill="none" stroke="#d97706" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>No scoring parameters configured for this event.</span>`;
    scoringPanel.appendChild(warn);
    renderScoringFooter(student, false);
    return;
  }

  const paramsWrap = document.createElement("div");
  paramsWrap.className = "params-wrap";
  currentEvent.parameters.forEach((p) => {
    const existing = Number(student.scores[p.parameter_id] || 0);
    const row = document.createElement("div");
    row.className = "param-row";
    row.innerHTML = `
      <div class="param-label-row">
        <label class="param-name">${escapeHtml(p.parameter_name)}</label>
        <span class="param-score-display"><span id="pv-${student.unique_id}-${
      p.parameter_id
    }">${existing}</span><span class="param-max"> / ${p.max_score}</span></span>
      </div>
      <div class="param-slider-wrap">
        <span class="param-min">0</span>
        <input type="range" class="param-slider" min="0" max="${
          p.max_score
        }" value="${existing}" step="1" data-pid="${
      p.parameter_id
    }" data-sid="${student.unique_id}" />
        <span class="param-max-label">${p.max_score}</span>
      </div>
      <div class="param-bar-bg"><div class="param-bar-fill" id="pb-${
        student.unique_id
      }-${p.parameter_id}" style="width:${
      p.max_score > 0 ? Math.round((existing / p.max_score) * 100) : 0
    }%"></div></div>`;
    row.querySelector("input").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      const pid = e.target.dataset.pid;
      const sid = e.target.dataset.sid;
      const st = currentEvent.students.find((x) => x.unique_id === sid);
      if (!st) return;
      st.scores[pid] = val;
      unsavedScoreWarning = true;
      const disp = document.getElementById(`pv-${sid}-${pid}`);
      if (disp) disp.textContent = val;
      const bar = document.getElementById(`pb-${sid}-${pid}`);
      if (bar)
        bar.style.width =
          (p.max_score > 0 ? Math.round((val / p.max_score) * 100) : 0) + "%";
      const total = currentEvent.parameters.reduce(
        (a, pr) => a + Number(st.scores[pr.parameter_id] || 0),
        0
      );
      const totalEl = document.getElementById("total-score");
      if (totalEl) totalEl.textContent = total;
    });
    paramsWrap.appendChild(row);
  });
  scoringPanel.appendChild(paramsWrap);

  const commentsWrap = document.createElement("div");
  commentsWrap.className = "comments-wrap";
  commentsWrap.innerHTML = `
    <label class="comments-label" for="cmt-${
      student.unique_id
    }">Additional Comments <span style="font-weight:400;color:#94a3b8">(optional)</span></label>
    <textarea id="cmt-${
      student.unique_id
    }" class="comments-area" rows="3" placeholder="Any observations...">${escapeHtml(
    student.comments || ""
  )}</textarea>`;
  commentsWrap.querySelector("textarea").addEventListener("input", (e) => {
    const st = currentEvent.students.find(
      (x) => x.unique_id === student.unique_id
    );
    if (st) st.comments = e.target.value;
  });
  scoringPanel.appendChild(commentsWrap);
  renderScoringFooter(student, true);
}

function renderScoringFooter(student, canSubmit) {
  if (!scoringPanel) return;
  const footer = document.createElement("div");
  footer.className = "scoring-footer";

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn-skip";
  skipBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg> Skip`;
  skipBtn.addEventListener("click", () => {
    const idx = currentEvent.students.findIndex(
      (x) => x.unique_id === student.unique_id
    );
    const next = currentEvent.students[idx + 1];
    if (next) renderScoringPanel(next.unique_id);
    else showDashboard();
  });
  footer.appendChild(skipBtn);

  if (canSubmit) {
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn-submit-score";
    submitBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit Score`;
    submitBtn.addEventListener("click", async () => {
      const st = currentEvent.students.find(
        (x) => x.unique_id === student.unique_id
      );
      if (!st) return;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="btn-spinner"></div> Submitting...`;
      try {
        const cmtEl = document.getElementById(`cmt-${student.unique_id}`);
        const payload = {
          studentId: st.unique_id,
          eventName: currentEvent.title,
          scores: st.scores || {},
          comments: cmtEl ? cmtEl.value : st.comments || "",
        };
        const resp = await fetch("/api/submit-score", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error || `Server error ${resp.status}`);
        }
        st.scored = true;
        unsavedScoreWarning = false;
        playSuccess();
        showToast(`${st.name} scored successfully!`, "success");
        populateStudentList();
        // Refresh dashboard stats in background
        setTimeout(jLoadRoomStats, 500);
        setTimeout(jLoadSummary, 500);

        const currIdx = currentEvent.students.findIndex(
          (x) => x.unique_id === student.unique_id
        );
        const nextUnscored =
          currentEvent.students.find((s, i) => !s.scored && i > currIdx) ||
          currentEvent.students.find((s) => !s.scored);
        if (nextUnscored) {
          renderScoringPanel(nextUnscored.unique_id);
        } else {
          scoringPanel.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;padding:64px;gap:16px;text-align:center">
              <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center">
                <svg width="36" height="36" fill="none" stroke="#16a34a" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p style="font-size:20px;font-weight:700;color:#16a34a">All Students Scored!</p>
              <p style="font-size:14px;color:#64748b">You can now close the room using the button above.</p>
            </div>`;
          setTimeout(showDashboard, 4000);
        }
      } catch (err) {
        showToast("Error: " + err.message, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit Score`;
      }
    });
    footer.appendChild(submitBtn);
  }
  scoringPanel.appendChild(footer);
}

// ── Dashboard show/hide ───────────────────────────────────────────────────────
function showDashboard(updateUrl = true) {
  dashboardView?.classList.remove("hidden");
  scoringView?.classList.add("hidden");
  scoringView?.classList.remove("visible");
  if (scoringPanel) scoringPanel.innerHTML = "";
  if (scoringEventTitle) scoringEventTitle.textContent = "";
  if (scoringEventSubtitle) scoringEventSubtitle.textContent = "";
  if (studentListUl) studentListUl.innerHTML = "";
  if (studentListHeader) studentListHeader.textContent = "Students (0)";
  if (studentProgressBar) studentProgressBar.style.width = "0%";
  if (studentProgressText) studentProgressText.textContent = "0% scored";
  if (livePollingInterval) {
    clearInterval(livePollingInterval);
    livePollingInterval = null;
  }
  currentEvent = null;
  currentStudent = null;
  unsavedScoreWarning = false;
  if (updateUrl) pushDashboardUrl();
  // Refresh dashboard data when coming back
  setTimeout(() => {
    jLoadRoomStats();
    jLoadSummary();
    jLoadActivityFeed();
  }, 300);
}

// ════════════════════════════════════════════════════════════════════════════
// NEW PREMIUM DASHBOARD FUNCTIONS — ADDED BELOW, NOTHING ABOVE TOUCHED
// ════════════════════════════════════════════════════════════════════════════

/** Wrapper: called by new room card start buttons */
function jStartScoringRoom(roomNumber, eventName, roomId) {
  startScoringByEvent("", eventName, roomNumber);
}

/** Toggle expandable student detail in room card */
function jToggleRoomDetail(roomId) {
  const el = document.getElementById(`jDetail-${roomId}`);
  if (!el) return;
  const isOpen = el.style.display === "block";
  el.style.display = isOpen ? "none" : "block";
  if (!isOpen) jFetchAndPopulateRoomDetail(roomId);
}

/** Fetch room stats and populate all card elements */
async function jFetchRoomStats(roomId) {
  try {
    const d = await safeFetchJson(`/judge/api/room-stats/${roomId}`);
    if (!d || d.error) return;
    const { stats, students, recentActivity, buckets } = d;
    const bColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];

    // Mini stats
    const statsEl = document.getElementById(`jStats-${roomId}`);
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="j-rc-mini-stat"><span class="j-rc-mini-val">${
          stats.total
        }</span><span class="j-rc-mini-lbl">Students</span></div>
        <div class="j-rc-mini-stat"><span class="j-rc-mini-val" style="color:#4ade80">${
          stats.scored
        }</span><span class="j-rc-mini-lbl">Scored</span></div>
        <div class="j-rc-mini-stat"><span class="j-rc-mini-val" style="color:#fdba74">${
          stats.avgScore || "—"
        }</span><span class="j-rc-mini-lbl">Avg</span></div>`;
    }

    // Progress bar
    const progHead = document.getElementById(`jProgHead-${roomId}`);
    const progFill = document.getElementById(`jProgFill-${roomId}`);
    if (progHead)
      progHead.innerHTML = `<span>Progress</span><span style="font-weight:700;color:${
        stats.pct >= 80 ? "#4ade80" : stats.pct >= 40 ? "#fdba74" : "#f87171"
      }">${stats.pct}%</span>`;
    if (progFill)
      setTimeout(() => (progFill.style.width = `${stats.pct}%`), 100);

    // Score distribution
    const distEl = document.getElementById(`jDist-${roomId}`);
    const maxB = Math.max(...buckets, 1);
    if (distEl && buckets.some((b) => b > 0)) {
      distEl.innerHTML = buckets
        .map((cnt, i) => {
          const h = cnt > 0 ? Math.max(Math.round((cnt / maxB) * 28), 3) : 2;
          return `<div class="j-rc-dist-col"><div class="j-rc-dist-bar" style="background:${
            bColors[i]
          };height:${h}px"></div><div class="j-rc-dist-lbl">${
            ["0-20", "21-40", "41-60", "61-80", "81+"][i]
          }</div></div>`;
        })
        .join("");
    }

    // Recent activity
    const actEl = document.getElementById(`jAct-${roomId}`);
    if (actEl) {
      if (recentActivity && recentActivity.length) {
        actEl.innerHTML = recentActivity
          .slice(0, 5)
          .map((a) => {
            const hue = (a.student_name.charCodeAt(0) * 17) % 360;
            const init = a.student_name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return `<div class="j-rc-act-item"><div class="j-rc-act-av" style="background:hsl(${hue},55%,40%)">${init}</div><div class="j-rc-act-name">${escapeHtml(
              a.student_name
            )}</div><div class="j-rc-act-score">${a.total}</div></div>`;
          })
          .join("");
      } else {
        actEl.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,.2);font-size:10px;padding:6px">No scores yet</div>`;
      }
    }
    return { stats, students, recentActivity };
  } catch (err) {
    console.error("jFetchRoomStats:", err);
  }
}

/** Populate expandable student list */
async function jFetchAndPopulateRoomDetail(roomId) {
  const el = document.getElementById(`jStudList-${roomId}`);
  if (!el) return;
  try {
    const d = await safeFetchJson(`/judge/api/room-stats/${roomId}`);
    if (!d || !d.students) {
      el.innerHTML = `<div style="color:rgba(255,255,255,.2);font-size:11px;text-align:center;padding:10px">No students</div>`;
      return;
    }
    el.innerHTML =
      d.students
        .map((s) => {
          const hue = (s.NAME.charCodeAt(0) * 17) % 360;
          const init = s.NAME.split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return `<div class="j-rc-stu-row">
        <div class="j-rc-stu-av" style="background:hsl(${hue},55%,40%)">${init}</div>
        <div style="flex:1;min-width:0"><div class="j-rc-stu-name">${escapeHtml(
          s.NAME
        )}</div><div class="j-rc-stu-school">${escapeHtml(
            s.SCHOOL || ""
          )}</div></div>
        <span class="j-rc-stu-badge ${
          s.is_scored ? "j-rc-stu-scored" : "j-rc-stu-pending"
        }">${s.is_scored ? `${s.total_score}pts` : "Pending"}</span>
      </div>`;
        })
        .join("") ||
      `<div style="color:rgba(255,255,255,.2);font-size:11px;text-align:center;padding:10px">No students</div>`;
  } catch (_) {}
}

/** Load stats for all assigned rooms */
async function jLoadRoomStats() {
  const data = window.JUDGE_DATA;
  if (!data) return;
  for (const room of data.assignedRooms || []) {
    await jFetchRoomStats(room.id);
  }
  // Historical rooms: basic stats
  for (const room of data.histRooms || []) {
    try {
      const d = await safeFetchJson(`/judge/api/room-stats/${room.id}`);
      if (!d || d.error) continue;
      const statsEl = document.getElementById(`jStats-hist-${room.id}`);
      if (statsEl) {
        const { stats } = d;
        statsEl.innerHTML = `
          <div class="j-rc-mini-stat"><span class="j-rc-mini-val">${
            stats.total
          }</span><span class="j-rc-mini-lbl">Students</span></div>
          <div class="j-rc-mini-stat"><span class="j-rc-mini-val" style="color:#4ade80">${
            stats.scored
          }</span><span class="j-rc-mini-lbl">Scored</span></div>
          <div class="j-rc-mini-stat"><span class="j-rc-mini-val" style="color:#fdba74">${
            stats.avgScore || "—"
          }</span><span class="j-rc-mini-lbl">Avg</span></div>`;
      }
    } catch (_) {}
  }
}

/** Load summary KPIs and donut card */
async function jLoadSummary() {
  try {
    const d = await safeFetchJson("/judge/api/summary");
    if (!d) return;
    const pct =
      d.totalInRoom > 0 ? Math.round((d.totalScored / d.totalInRoom) * 100) : 0;

    // KPI strip — uses original IDs (total-students, students-scored, completed) + new ones
    const kpiAvg = document.getElementById("kpi-avg");
    if (kpiAvg) kpiAvg.textContent = d.avgScore || "—";
    // total-students and students-scored are updated by the existing stats interval
    // so we only set them here if they're still 0
    const ts = document.getElementById("total-students");
    if (ts && ts.textContent === "0") ts.textContent = d.totalInRoom || 0;
    const ss = document.getElementById("students-scored");
    if (ss && ss.textContent === "0") ss.textContent = d.totalScored || 0;

    // Summary donut body
    const body = document.getElementById("jSummaryBody");
    if (!body) return;
    const col = pct >= 80 ? "#22c55e" : pct >= 40 ? "#f97316" : "#6366f1";
    const r = 24,
      circ = 2 * Math.PI * r,
      fill = Math.min(pct / 100, 1) * circ;
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="position:relative;width:68px;height:68px;flex-shrink:0">
          <svg width="68" height="68" viewBox="0 0 68 68" style="transform:rotate(-90deg);overflow:visible">
            <circle cx="34" cy="34" r="${r}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="6"/>
            <circle cx="34" cy="34" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"
              stroke-dasharray="${fill.toFixed(2)} ${circ.toFixed(2)}"
              style="transition:stroke-dasharray 1.2s ease"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <span style="font-size:15px;font-weight:800;color:#fff;line-height:1">${pct}%</span>
            <span style="font-size:8px;color:rgba(255,255,255,.3);margin-top:1px">done</span>
          </div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.8)">My Progress</div>
          <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:3px">${
            d.totalScored || 0
          } of ${d.totalInRoom || 0} scored</div>
          ${
            d.room
              ? `<div style="margin-top:7px"><span style="font-size:10px;background:rgba(249,115,22,.1);color:#fdba74;padding:2px 8px;border-radius:20px;font-weight:700">${escapeHtml(
                  d.room.event_name
                )} · Room ${escapeHtml(d.room.room_number)}</span></div>`
              : ""
          }
        </div>
      </div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,.05);margin:2px 0"/>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.12);border-radius:10px;padding:9px;text-align:center">
          <div style="font-size:17px;font-weight:800;color:#4ade80">${
            d.presentInRoom || 0
          }</div>
          <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:2px">Present Today</div>
        </div>
        <div style="background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.12);border-radius:10px;padding:9px;text-align:center">
          <div style="font-size:17px;font-weight:800;color:#a78bfa">${
            d.avgScore || 0
          }</div>
          <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:2px">Avg Score</div>
        </div>
      </div>
      ${
        d.room
          ? `
      <div style="display:flex;align-items:center;gap:7px;padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:9px">
        <div style="width:7px;height:7px;border-radius:50%;background:${
          d.room.status === "closed"
            ? "#ef4444"
            : d.room.judge_done
            ? "#6366f1"
            : "#22c55e"
        };flex-shrink:0"></div>
        <span style="font-size:11px;color:rgba(255,255,255,.5)">Room: <strong style="color:#fff">${
          d.room.status === "closed"
            ? "Closed"
            : d.room.judge_done
            ? "Ready"
            : d.room.status
        }</strong></span>
      </div>`
          : ""
      }`;
  } catch (err) {
    console.error("jLoadSummary:", err);
  }
}

/** Load activity feed in sidebar */
async function jLoadActivityFeed() {
  const el = document.getElementById("jActList");
  const badge = document.getElementById("jActCount");
  if (!el) return;
  const roomId = window.JUDGE_DATA?.roomId;
  if (!roomId) {
    el.innerHTML = `<div style="padding:16px;text-align:center;color:rgba(255,255,255,.15);font-size:11px">No room assigned</div>`;
    return;
  }
  try {
    const d = await safeFetchJson(`/judge/api/room-stats/${roomId}`);
    const activity = d?.recentActivity || [];
    if (badge) badge.textContent = activity.length;
    if (!activity.length) {
      el.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,.15);font-size:11px;display:flex;flex-direction:column;align-items:center;gap:6px">
        <svg width="24" height="24" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span>No activity yet</span></div>`;
      return;
    }
    el.innerHTML = activity
      .map((a, i) => {
        const col =
          a.total > 80 ? "#22c55e" : a.total > 50 ? "#f97316" : "#6366f1";
        return `<div class="j-act-item" style="animation:jFU .25s ease ${
          i * 0.05
        }s both">
        <div class="j-act-dot" style="background:${col}"></div>
        <div class="j-act-text"><strong>${escapeHtml(
          a.student_name
        )}</strong> · ${escapeHtml(a.event_name)}</div>
        <div class="j-act-score">${a.total}</div>
        <div class="j-act-time">${formatTime(a.scored_at)}</div>
      </div>`;
      })
      .join("");
  } catch (_) {}
}

/** Sidebar message list (new IDs — doesn't conflict with drawer) */
async function jSbLoadMessages() {
  const list = document.getElementById("jSbMsgList");
  if (!list) return;
  try {
    const msgs = await safeFetchJson("/api/messages").catch(() => []);
    if (!msgs || !msgs.length) return;
    const prevLen = list.querySelectorAll(".j-sb-bubble").length;
    list.innerHTML = "";
    msgs.forEach((m, i) => {
      const isMe = m.from_role === "Judge";
      const wrap = document.createElement("div");
      wrap.style.cssText = `display:flex;flex-direction:column;align-items:${
        isMe ? "flex-end" : "flex-start"
      };animation:jFU .2s ease ${i * 0.03}s both`;
      wrap.innerHTML = `<div class="j-sb-bubble ${
        isMe ? "j-sb-from-me" : "j-sb-from-admin"
      }">${escapeHtml(m.body)}<span class="j-sb-meta">${
        isMe ? "You" : "Admin"
      } · ${formatTime(m.created_at)}</span></div>`;
      list.appendChild(wrap);
    });
    list.scrollTop = list.scrollHeight;
    if (msgs.length > prevLen && prevLen > 0) playNotification();
  } catch (_) {}
}

async function jSbSendMessage() {
  const input = document.getElementById("jSbMsgInput");
  const body = input?.value.trim();
  if (!body) return;
  const btn = document.querySelector(".j-sb-send-btn");
  if (btn) btn.disabled = true;
  try {
    await safeFetchJson("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (input) input.value = "";
    await jSbLoadMessages();
    await loadMessages(); // sync drawer too
    showToast("Sent!", "success");
  } catch (_) {
    showToast("Failed to send.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** New help button (sidebar card) */
async function jSendHelpRequest() {
  const now = Date.now();
  if (now - lastHelpThrottle < 30000) {
    showToast("Please wait 30s before another request.", "warn");
    return;
  }
  const msg = prompt("Describe what you need help with:");
  if (!msg?.trim()) return;
  try {
    await safeFetchJson("/api/help-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg.trim() }),
    });
    lastHelpThrottle = now;
    showToast("Help request sent! Admin notified.", "success");
    playSuccess();
  } catch (_) {
    showToast("Failed to send.", "error");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Wire original "Start Scoring" buttons (old room cards if still present)
  document.querySelectorAll(".btn-start-scoring").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      startScoringByEvent(
        btn.dataset.eventId || "",
        btn.dataset.eventName,
        btn.dataset.roomNumber || btn.dataset.room || ""
      );
    });
  });

  // Check room status on load
  const status = await checkRoomStatus();
  if (status && status.status === "closed") {
    roomIsClosed = true;
    updateRoomClosedBadge(true);
  }

  // autoStart from URL
  const params = new URLSearchParams(window.location.search);
  if (params.get("autoStart") === "1") {
    const room = params.get("room");
    const event = params.get("event");
    if (room && event && !roomIsClosed) {
      window.history.replaceState({}, "", "/judge/dashboard");
      startScoringByEvent("", event, room);
    } else if (roomIsClosed) {
      showToast("This room has been closed. Scoring is not available.", "warn");
    }
  }

  // Sidebar message input keyboard
  document.getElementById("jSbMsgInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      jSbSendMessage();
    }
  });

  // Original stats polling
  setInterval(async () => {
    try {
      const s = await safeFetchJson("/judge/stats");
      const ts = document.getElementById("total-students");
      const ss = document.getElementById("students-scored");
      const cp = document.getElementById("completed");
      if (ts) ts.textContent = s.totalStudents ?? 0;
      if (ss) ss.textContent = s.studentsScored ?? 0;
      if (cp) cp.textContent = s.completedEvents ?? 0;
    } catch (_) {}
  }, 6000);

  // Original polling
  pollAnnouncements();
  announcementInterval = setInterval(pollAnnouncements, 7000);
  pollMessages();
  msgPollingInterval = setInterval(pollMessages, 9000);
  roomStatusInterval = setInterval(async () => {
    const s = await checkRoomStatus();
    if (s && s.status === "closed" && !roomIsClosed) {
      roomIsClosed = true;
      updateRoomClosedBadge(true);
      if (scoringView && !scoringView.classList.contains("hidden")) {
        showToast("Room closed by admin. Scoring stopped.", "warn", 6000);
        showRoomClosedInScoring();
      }
    }
  }, 15000);

  // NEW: load premium dashboard data
  jLoadRoomStats();
  jLoadSummary();
  jLoadActivityFeed();
  jSbLoadMessages();

  // NEW: refresh premium data periodically
  setInterval(jLoadRoomStats, 18000);
  setInterval(jLoadSummary, 15000);
  setInterval(jLoadActivityFeed, 12000);
  setInterval(jSbLoadMessages, 10000);
});
