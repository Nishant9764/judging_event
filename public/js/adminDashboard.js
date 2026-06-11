// public/js/adminDashboard.js — Production Grade + Premium Analytics (all-in-one)
"use strict";

// ── Premium Audio ─────────────────────────────────────────────────────────────
let prevHelpCount = 0;

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      help: [
        [880, 0, 0.2, "sine"],
        [1100, 0.12, 0.18, "sine"],
        [1320, 0.24, 0.22, "square"],
      ],
      close: [
        [440, 0, 0.25, "sine"],
        [554, 0.18, 0.25, "sine"],
        [659, 0.36, 0.35, "sine"],
      ],
      message: [
        [660, 0, 0.15, "sine"],
        [880, 0.1, 0.2, "sine"],
      ],
      success: [
        [523, 0, 0.15, "sine"],
        [659, 0.1, 0.2, "sine"],
        [784, 0.22, 0.3, "sine"],
      ],
      alert: [
        [740, 0, 0.2, "sine"],
        [740, 0.25, 0.2, "sine"],
      ],
    };
    (sounds[type] || sounds.alert).forEach(([freq, delay, dur, wave]) => {
      const osc = ctx.createOscillator(),
        g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur + 0.05);
    });
  } catch (_) {}
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function adminToast(msg, type = "success") {
  let cont = document.getElementById("admin-toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "admin-toast-container";
    cont.style.cssText =
      "position:fixed;bottom:28px;right:28px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(cont);
  }
  const bg = {
    success: "#16a34a",
    error: "#dc2626",
    warn: "#b45309",
    info: "#1e293b",
  };
  const toast = document.createElement("div");
  toast.style.cssText = `background:${
    bg[type] || bg.info
  };color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.3);opacity:0;transition:opacity .25s,transform .25s;max-width:340px;pointer-events:auto;transform:translateY(8px);`;
  toast.textContent = msg;
  cont.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
function fmtTime(ts) {
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
function fmtDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? 0;
}
function addUniqueOptions(sel, values, key) {
  if (!sel) return;
  const existing = new Set(Array.from(sel.options).map((o) => o.value));
  values.forEach((v) => {
    const val = typeof v === "string" ? v : v[key];
    if (val && !existing.has(val)) {
      sel.add(new Option(val, val));
      existing.add(val);
    }
  });
}

// ── State ─────────────────────────────────────────────────────────────────────
let allJudges = [],
  allRooms = [],
  judgeFilter = "all";

// ── Dashboard fetch ───────────────────────────────────────────────────────────
window.fetchDashboard = async function () {
  try {
    const data = await fetch("/admin/dashboard-data", {
      credentials: "include",
    }).then((r) => r.json());
    setText("totalRooms", data.totalRooms);
    setText("totalJudges", data.totalJudges);
    setText("openRooms", data.openRooms);
    setText("closedRooms", data.closedRooms);
    setText("pendingCloseRooms", data.pendingClose || 0);
    setText("assignedJudges", data.assignedJudges);
    setText("completedJudges", data.completedJudges);
    setText("ov-totalStudents", data.totalStudents);
    setText("ov-scoredStudents", data.scoredStudents);
    const pct =
      data.totalStudents > 0
        ? Math.round((data.scoredStudents / data.totalStudents) * 100)
        : 0;
    setText("ov-completion", pct + "%");
    const rpb = document.getElementById("rooms-pending-badge");
    if (rpb) {
      rpb.textContent = data.pendingClose || 0;
      rpb.style.display = (data.pendingClose || 0) > 0 ? "inline-flex" : "none";
    }
    allJudges = data.judges || [];
    allRooms = data.rooms || [];
    renderRoomsTable(allRooms);
    renderJudgesTable(allJudges);
    renderAlerts(data.alerts || []);
    renderHelpRequests();
    syncMsgRecipients(allJudges);
    updateAdminAnnBanner();
    updateTopPerformers();
    const helpCount = data.helpPendingCount || 0;
    if (helpCount > prevHelpCount) {
      playSound("help");
      adminToast("New help request from a judge!", "error");
    }
    prevHelpCount = helpCount;
    if ((data.pendingClose || 0) > 0) playSound("close");
  } catch (err) {
    console.error("fetchDashboard:", err);
  }
};

// ── Rooms table ───────────────────────────────────────────────────────────────
function renderRoomsTable(rooms) {
  const tbody = document.getElementById("roomsTableBody");
  if (!tbody) return;
  if (!rooms.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">No rooms created yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rooms
    .map((r, i) => {
      const pct =
        r.totalStudents > 0
          ? Math.round((r.scoredStudents / r.totalStudents) * 100)
          : 0;
      const judgesHtml =
        (r.judges || [])
          .map((j) => {
            const done = j.assignment_status === "completed";
            return `<span class="judge-chip ${
              done ? "judge-chip-done" : "judge-chip-active"
            }"><span class="judge-chip-avatar">${esc(
              j.name.charAt(0).toUpperCase()
            )}</span><span>${esc(j.name)}</span>${
              done
                ? `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
                : ""
            }</span>`;
          })
          .join("") ||
        `<span style="color:#94a3b8;font-size:12px">No judges</span>`;
      let statusBadge,
        rowClass = "";
      if (r.status === "closed") {
        statusBadge = `<span class="room-status-badge status-closed"><span class="status-dot"></span>Closed</span>`;
        rowClass = "row-closed";
      } else if (r.judge_done) {
        statusBadge = `<span class="room-status-badge status-ready"><span class="status-dot"></span>Ready</span>`;
        rowClass = "row-ready";
      } else {
        statusBadge = `<span class="room-status-badge status-open"><span class="status-dot"></span>Open</span>`;
      }
      const timerHtml =
        r.status !== "closed"
          ? `<span class="room-live-timer" data-room-id="${r.id}" data-start="${
              r.created_at || ""
            }">—</span>`
          : `<span style="color:#94a3b8;font-size:11px">Closed</span>`;
      let actions = "";
      if (r.status !== "closed" && r.judge_done) {
        actions = `<button class="action-btn action-btn-close" onclick="adminCloseRoom(${
          r.id
        },'${esc(r.room_number)}')">Final Close</button>`;
      } else if (r.status === "closed") {
        actions = `<button class="action-btn action-btn-open" onclick="adminReopenRoom(${
          r.id
        },'${esc(r.room_number)}')">Reopen</button>`;
      } else {
        actions = `<span class="action-waiting">Awaiting judges</span>`;
      }
      return `<tr class="${rowClass}" style="animation:rowIn .3s ease ${
        i * 0.04
      }s both">
      <td class="td-num">${i + 1}</td>
      <td><div class="room-cell-name"><div class="room-icon">${esc(
        r.room_number.charAt(0)
      )}</div><div><strong style="color:#1e293b">${esc(
        r.room_number
      )}</strong><br><span style="font-size:11px;color:#94a3b8">${esc(
        r.event_name
      )}</span></div></div></td>
      <td><div class="judges-chips">${judgesHtml}</div></td>
      <td style="color:#64748b">${r.totalStudents}</td>
      <td><div style="min-width:120px"><div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div><small style="color:#64748b;font-size:11px">${
        r.scoredStudents
      }/${r.totalStudents} ${pct}%</small></div></td>
      <td>${timerHtml}</td><td>${statusBadge}</td>
      <td><div class="tbl-actions">${actions}</div></td>
    </tr>`;
    })
    .join("");
  startRoomTimers();
}

function startRoomTimers() {
  clearInterval(window._roomTimerInterval);
  window._roomTimerInterval = setInterval(() => {
    document.querySelectorAll(".room-live-timer").forEach((el) => {
      const start = el.dataset.start;
      if (!start) return;
      const ms = Date.now() - new Date(start).getTime();
      if (ms < 0) return;
      const h = Math.floor(ms / 3600000),
        m = Math.floor((ms % 3600000) / 60000),
        s = Math.floor((ms % 60000) / 1000);
      el.textContent = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
    });
  }, 1000);
}

// ── Judges table ──────────────────────────────────────────────────────────────
function renderJudgesTable(judges) {
  const tbody = document.getElementById("judgesTableBody");
  if (!tbody) return;
  const filtered =
    judgeFilter === "all"
      ? judges
      : judges.filter((j) => {
          if (judgeFilter === "completed")
            return j.assignment_status === "completed";
          if (judgeFilter === "active")
            return j.room_id && j.assignment_status !== "completed";
          if (judgeFilter === "unassigned") return !j.room_id;
          return true;
        });
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="td-empty">No judges match filter.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map((j, i) => {
      const hue = (j.name.charCodeAt(0) * 17) % 360;
      const initials = j.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      let badge = "";
      if (j.assignment_status === "completed")
        badge = `<span class="room-status-badge status-closed">Done</span>`;
      else if (j.room_id)
        badge = `<span class="room-status-badge status-open">Active</span>`;
      else
        badge = `<span class="room-status-badge" style="background:#f1f5f9;color:#64748b">Unassigned</span>`;
      const reassign =
        j.assignment_status === "completed"
          ? `<button class="action-btn action-btn-open" onclick="prefillReassign('${esc(
              j.name
            )}','${esc(j.email || "")}')">Reassign</button>`
          : "";
      return `<tr style="animation:rowIn .3s ease ${i * 0.04}s both">
      <td class="td-num">${i + 1}</td>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="judge-avatar-circle" style="background:hsl(${hue},65%,55%)">${initials}</div><div><strong style="color:#1e293b">${esc(
        j.name
      )}</strong><br><span style="font-size:11px;color:#94a3b8">${esc(
        j.email || "—"
      )}</span></div></div></td>
      <td>${
        j.room_number
          ? `<span class="room-tag">${esc(j.room_number)}</span>`
          : `<span style="color:#94a3b8">—</span>`
      }</td>
      <td>${
        j.event_name
          ? `<span class="event-badge" style="font-size:11px">${esc(
              j.event_name
            )}</span>`
          : "—"
      }</td>
      <td>${badge}</td><td><div class="tbl-actions">${reassign}</div></td>
    </tr>`;
    })
    .join("");
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function renderAlerts(alerts) {
  ["dashboardAlerts", "dashboardAlerts1"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!alerts.length) {
      el.innerHTML = `<p class="muted-text">All clear — no alerts.</p>`;
      return;
    }
    const countEl = document.getElementById("alertCount");
    if (countEl) countEl.textContent = alerts.length;
    el.innerHTML = alerts
      .map((a, idx) => {
        const typeClass =
          a.type === "help"
            ? "alert-help"
            : a.type === "room_ready"
            ? "alert-ready"
            : a.type === "room_closed"
            ? "alert-closed"
            : "";
        const icons = {
          help: "🆘",
          room_ready: "🔔",
          room_closed: "✅",
          judge_done: "👤",
          room_full: "📌",
        };
        const icon =
          typeof a === "object" && icons[a.type] ? icons[a.type] : "•";
        const msg = typeof a === "string" ? a : a.message;
        const time = typeof a === "object" ? fmtTime(a.time) : "";
        return `<div class="alert-row ${typeClass}" style="animation:rowIn .3s ease ${
          idx * 0.05
        }s both"><span class="alert-icon">${icon}</span><span class="alert-msg">${esc(
          msg
        )}</span>${
          time ? `<span class="alert-time">${time}</span>` : ""
        }</div>`;
      })
      .join("");
  });
}

// ── Help requests ─────────────────────────────────────────────────────────────
async function renderHelpRequests() {
  const el = document.getElementById("helpRequestsList");
  const badge = document.getElementById("help-count-badge");
  const ping = document.getElementById("help-ping-badge");
  if (!el) return;
  try {
    const reqs = await fetch("/api/help-requests", {
      credentials: "include",
    }).then((r) => r.json());
    const pending = reqs.filter((r) => r.status === "pending").length;
    if (badge) badge.textContent = pending;
    if (ping) {
      ping.textContent = pending;
      ping.style.display = pending > 0 ? "flex" : "none";
    }
    if (!reqs.length) {
      el.innerHTML = `<div class="empty-state-sm"><svg width="32" height="32" fill="none" stroke="#94a3b8" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><p>No pending help requests</p></div>`;
      return;
    }
    el.innerHTML = reqs
      .map((h, idx) => {
        const hue = (h.judge_name.charCodeAt(0) * 17) % 360;
        const initials = h.judge_name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return `<div class="help-item ${
          h.status === "acknowledged" ? "acknowledged" : ""
        }" style="animation:rowIn .3s ease ${idx * 0.06}s both">
        <div style="display:flex;align-items:flex-start;gap:12px;flex:1"><div class="judge-avatar-circle" style="background:hsl(${hue},65%,55%);width:36px;height:36px;font-size:13px;flex-shrink:0">${initials}</div>
        <div class="help-info"><strong>${esc(h.judge_name)} — Room ${esc(
          h.room_number || "?"
        )}</strong><p>${esc(
          h.message || "Needs help"
        )}</p><p style="font-size:11px;color:#94a3b8;margin-top:3px">${fmtDate(
          h.created_at
        )} · <span style="text-transform:capitalize">${
          h.status
        }</span></p></div></div>
        <div class="help-actions">${
          h.status === "pending"
            ? `<button class="action-btn action-btn-open" onclick="ackHelp(${h.id})">Acknowledge</button>`
            : ""
        }<button class="action-btn action-btn-close" onclick="resolveHelp(${
          h.id
        })">Resolve</button></div>
      </div>`;
      })
      .join("");
  } catch (_) {}
}
async function ackHelp(id) {
  await fetch(`/api/help-requests/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "acknowledged" }),
  });
  adminToast("Acknowledged.");
  renderHelpRequests();
}
async function resolveHelp(id) {
  await fetch(`/api/help-requests/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved" }),
  });
  adminToast("Resolved!", "success");
  renderHelpRequests();
}

// ── Room close/reopen ─────────────────────────────────────────────────────────
async function adminCloseRoom(roomId, roomNumber) {
  if (!confirm(`Officially close Room ${roomNumber}? Scoring will be locked.`))
    return;
  try {
    const d = await fetch(`/api/admin-close-room/${roomId}`, {
      method: "POST",
      credentials: "include",
    }).then((r) => r.json());
    adminToast(d.message || "Room closed.", "success");
    playSound("success");
    fetchDashboard();
  } catch (err) {
    adminToast("Failed: " + err.message, "error");
  }
}
async function adminReopenRoom(roomId, roomNumber) {
  if (!confirm(`Reopen Room ${roomNumber}?`)) return;
  try {
    const d = await fetch(`/api/admin-reopen-room/${roomId}`, {
      method: "POST",
      credentials: "include",
    }).then((r) => r.json());
    adminToast(d.message || "Room reopened.", "success");
    fetchDashboard();
  } catch (err) {
    adminToast("Failed: " + err.message, "error");
  }
}
function refreshAssignments() {
  fetchDashboard();
  adminToast("Refreshed.", "info");
}

// ── Announcements ─────────────────────────────────────────────────────────────
async function sendAnnouncement() {
  const msg = document.getElementById("ann-input")?.value.trim();
  const prio = document.getElementById("ann-priority")?.value || "normal";
  if (!msg) {
    adminToast("Enter a message first.", "warn");
    return;
  }
  try {
    await fetch("/api/announcements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, priority: prio }),
    });
    adminToast("Announcement sent!", "success");
    playSound("success");
    const inp = document.getElementById("ann-input");
    if (inp) inp.value = "";
    updateAdminAnnBanner();
  } catch (_) {
    adminToast("Failed to send.", "error");
  }
}
async function clearAllAnnouncements() {
  await fetch("/api/announcements", {
    method: "DELETE",
    credentials: "include",
  });
  const b = document.getElementById("admin-ann-banner");
  if (b) b.classList.add("hidden");
  adminToast("Cleared.");
}
async function updateAdminAnnBanner() {
  try {
    const anns = await fetch("/api/announcements", {
      credentials: "include",
    }).then((r) => r.json());
    const b = document.getElementById("admin-ann-banner"),
      t = document.getElementById("admin-ann-text");
    if (!b || !t) return;
    if (anns && anns.length) {
      t.textContent = `Active: "${anns[0].message}" (${anns[0].priority}) — ${anns.length} announcement(s)`;
      b.classList.remove("hidden");
    } else b.classList.add("hidden");
  } catch (_) {}
}

// ── Messages ──────────────────────────────────────────────────────────────────
function syncMsgRecipients(judges) {
  const sel = document.getElementById("msg-recipient");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">Broadcast to ALL Judges</option>`;
  judges.forEach((j) =>
    sel.appendChild(
      new Option(`${j.name} (Room ${j.room_number || "N/A"})`, j.id)
    )
  );
  if (prev) sel.value = prev;
}
window.refreshMessages = async function () {
  const list = document.getElementById("admin-msg-list");
  const selEl = document.getElementById("msg-recipient");
  const judgeId = selEl ? selEl.value : "";
  if (!list) return;
  try {
    const msgs = judgeId
      ? await fetch(`/api/messages/with-judge/${judgeId}`, {
          credentials: "include",
        }).then((r) => r.json())
      : await fetch("/api/messages", { credentials: "include" }).then((r) =>
          r.json()
        );
    if (!msgs || !msgs.length) {
      list.innerHTML = `<div class="msg-empty"><svg width="40" height="40" fill="none" stroke="#cbd5e1" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>No messages yet</p></div>`;
      return;
    }
    const prevCount = list.querySelectorAll(".admin-msg-bubble").length;
    list.innerHTML = "";
    msgs.forEach((m, idx) => {
      const isAdmin = m.from_role === "Administrator";
      const hue = (m.from_name.charCodeAt(0) * 17) % 360;
      const initials = m.from_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const to = m.to_id ? ` to ${esc(m.to_name || "?")}` : " to All";
      const wrapper = document.createElement("div");
      wrapper.className = `msg-row ${
        isAdmin ? "msg-row-admin" : "msg-row-judge"
      }`;
      wrapper.style.animationDelay = idx * 0.03 + "s";
      wrapper.innerHTML = `${
        !isAdmin
          ? `<div class="msg-avatar-sm" style="background:hsl(${hue},65%,55%)">${initials}</div>`
          : ""
      }
        <div class="msg-bubble-wrap ${
          isAdmin ? "ml-auto" : ""
        }"><div class="admin-msg-bubble ${
        isAdmin ? "from-admin" : "from-judge"
      }">${esc(m.body)}</div><div class="msg-meta">${esc(
        m.from_name
      )}${to} · ${fmtTime(m.created_at)}</div></div>
        ${
          isAdmin ? `<div class="msg-avatar-sm msg-avatar-admin">A</div>` : ""
        }`;
      list.appendChild(wrapper);
    });
    list.scrollTop = list.scrollHeight;
    if (msgs.length > prevCount) playSound("message");
    await fetch("/api/messages/read", {
      method: "PUT",
      credentials: "include",
    }).catch(() => {});
    updateMsgNavBadge(0);
  } catch (_) {}
};
async function sendAdminMessage() {
  const input = document.getElementById("admin-msg-input");
  const selEl = document.getElementById("msg-recipient");
  const body = input ? input.value.trim() : "";
  if (!body) return;
  const to_id = selEl && selEl.value ? Number(selEl.value) : null;
  const to_name =
    to_id && selEl
      ? selEl.options[selEl.selectedIndex].text.split(" (")[0]
      : null;
  const btn = document.getElementById("admin-msg-send");
  if (btn) btn.disabled = true;
  try {
    await fetch("/api/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, to_id, to_name }),
    });
    if (input) input.value = "";
    refreshMessages();
    playSound("success");
  } catch (_) {
    adminToast("Failed to send.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
function updateMsgNavBadge(n) {
  const el = document.getElementById("msg-nav-badge");
  if (!el) return;
  el.textContent = n;
  el.style.display = n > 0 ? "inline-flex" : "none";
}
async function pollUnread() {
  try {
    const d = await fetch("/api/messages/unread", {
      credentials: "include",
    }).then((r) => r.json());
    const n = d?.unread || 0;
    if (n > 0) playSound("alert");
    updateMsgNavBadge(n);
  } catch (_) {}
}

// ── Feature 4: Top performers ─────────────────────────────────────────────────
async function updateTopPerformers() {
  const container = document.getElementById("top-performers-row");
  if (!container) return;
  try {
    const lb = await fetch("/api/leaderboard", { credentials: "include" }).then(
      (r) => r.json()
    );
    if (!lb || !lb.length) {
      container.innerHTML = `<p class="muted-text">No scores yet.</p>`;
      return;
    }
    const byEvent = {};
    lb.forEach((r) => {
      if (
        !byEvent[r.event_name] ||
        r.total_score > byEvent[r.event_name].total_score
      )
        byEvent[r.event_name] = r;
    });
    container.innerHTML = Object.values(byEvent)
      .map((r) => {
        const hue = (r.student_name.charCodeAt(0) * 17) % 360;
        return `<div class="top-performer-pill" style="animation:rowIn .4s ease"><div class="judge-avatar-circle" style="background:hsl(${hue},65%,55%);width:32px;height:32px;font-size:12px">${esc(
          r.student_name.charAt(0)
        )}</div><div><div style="font-size:12px;font-weight:700;color:#1e293b">${esc(
          r.student_name
        )}</div><div style="font-size:10px;color:#94a3b8">${esc(
          r.event_name
        )} · <strong style="color:#6366f1">${
          r.total_score
        }pts</strong></div></div><span style="background:#fef3c7;color:#b45309;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">1st</span></div>`;
      })
      .join("");
  } catch (_) {}
}

// ── Feature 5: Print leaderboard ─────────────────────────────────────────────
window.printLeaderboard = function () {
  const rows = document.querySelectorAll("#leaderboardBody tr");
  if (!rows.length) {
    adminToast("No data to print.", "warn");
    return;
  }
  let table =
    "<table border='1' style='border-collapse:collapse;width:100%;font-family:Arial;font-size:12px'><thead><tr style='background:#f97316;color:#1a0a2e'><th>Rank</th><th>Student</th><th>School</th><th>Event</th><th>Group</th><th>Score</th></tr></thead><tbody>";
  rows.forEach((r) => {
    if (r.style.display === "none") return;
    const c = r.querySelectorAll("td");
    if (c.length < 7) return;
    table += `<tr><td>${c[0].textContent.trim()}</td><td>${c[1].textContent.trim()}</td><td>${c[2].textContent.trim()}</td><td>${c[3].textContent.trim()}</td><td>${c[4].textContent.trim()}</td><td>${c[6].textContent.trim()}</td></tr>`;
  });
  table += "</tbody></table>";
  const win = window.open("", "_blank", "width=800,height=600");
  win.document.write(
    `<!DOCTYPE html><html><head><title>ISKCON NRJD Nandotsav — Leaderboard</title><style>body{font-family:Arial;padding:24px}h1{color:#f97316;font-family:Georgia}@media print{.no-print{display:none}}</style></head><body><h1>ISKCON NRJD Nandotsav 2025</h1><p>Leaderboard — Generated ${new Date().toLocaleString()}</p><button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer">Print</button>${table}<p style="margin-top:20px;font-style:italic">Hare Krishna Hare Krishna · Krishna Krishna Hare Hare</p></body></html>`
  );
  win.document.close();
};

// ── Feature 7: ETA ────────────────────────────────────────────────────────────
async function computeETA() {
  try {
    const data = await fetch("/admin/dashboard-data", {
      credentials: "include",
    }).then((r) => r.json());
    const scored = data.scoredStudents || 0,
      total = data.totalStudents || 0;
    if (scored === 0 || total === 0) return "Scoring not started";
    if (scored >= total) return "Complete!";
    const remaining = total - scored;
    const estMins = Math.ceil((remaining / (scored || 1)) * 15);
    return estMins > 120
      ? `~${Math.ceil(estMins / 60)}h remaining`
      : `~${estMins}m remaining`;
  } catch (_) {
    return "—";
  }
}

// ── Feature 8: Dark/Light mode ────────────────────────────────────────────────
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const saved = localStorage.getItem("admin-theme") || "dark";
  document.body.dataset.theme = saved;
  btn.title = saved === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
  btn.addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem("admin-theme", next);
    btn.title =
      next === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
    adminToast(`${next === "dark" ? "Dark" : "Light"} mode enabled.`, "info");
  });
}

// ── Feature 10: Full report export ───────────────────────────────────────────
window.exportFullReport = async function () {
  adminToast("Preparing full report...", "info");
  try {
    const [dash, lb, att] = await Promise.all([
      fetch("/admin/dashboard-data", { credentials: "include" }).then((r) =>
        r.json()
      ),
      fetch("/api/leaderboard", { credentials: "include" }).then((r) =>
        r.json()
      ),
      fetch("/api/attendance-stats", { credentials: "include" }).then((r) =>
        r.json()
      ),
    ]);
    const rows = [
      "ISKCON NRJD Nandotsav 2025 — Full Report",
      "Generated:," + new Date().toLocaleString(),
      "",
      "=== OVERVIEW ===",
      `Schools,${dash.totalSchools || 0}`,
      `Events,${dash.totalEvents || 0}`,
      `Students,${dash.totalStudents || 0}`,
      `Scored,${dash.scoredStudents || 0}`,
      `Attendance,${att.overall?.present || 0} / ${att.overall?.total || 0}`,
      "",
      "=== LEADERBOARD ===",
      "Rank,Student,School,Event,Group,Score",
    ];
    (lb || []).forEach((r) =>
      rows.push(
        `#${r.rank},"${r.student_name}","${r.school_name}","${r.event_name}","${r.group_id}",${r.total_score}`
      )
    );
    rows.push(
      "",
      "=== ATTENDANCE BY EVENT ===",
      "Event,Total,Present,Absent,Rate"
    );
    (att.byEvent || []).forEach((e) =>
      rows.push(
        `"${e.event_name}",${e.total},${e.present},${e.absent},${e.attendance_pct}%`
      )
    );
    rows.push(
      "",
      "=== ATTENDANCE BY SCHOOL ===",
      "School,Total,Present,Absent,Rate"
    );
    (att.bySchool || []).forEach((s) =>
      rows.push(
        `"${s.school_name}",${s.total},${s.present},${s.absent},${s.attendance_pct}%`
      )
    );
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(
        new Blob([rows.join("\n")], { type: "text/csv" })
      ),
      download: `NRJD_Report_${Date.now()}.csv`,
    });
    a.click();
    adminToast("Full report exported!", "success");
    playSound("success");
  } catch (err) {
    adminToast("Export failed: " + err.message, "error");
  }
};

// ── Leaderboard ───────────────────────────────────────────────────────────────
window.loadLeaderboard = async function () {
  const tbody = document.getElementById("leaderboardBody");
  if (!tbody) return;
  const ev = document.getElementById("eventFilter")?.value || "";
  const gr = document.getElementById("groupFilter")?.value || "";
  const sc = document.getElementById("schoolFilter")?.value || "";
  const rank = parseInt(document.getElementById("rankFilter")?.value || "0");
  let url = `/api/leaderboard?`;
  if (ev) url += `event=${encodeURIComponent(ev)}&`;
  if (gr) url += `group_id=${encodeURIComponent(gr)}&`;
  if (sc) url += `school=${encodeURIComponent(sc)}&`;
  try {
    const data = await fetch(url, { credentials: "include" }).then((r) =>
      r.json()
    );
    if (!data || !data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="td-empty">No results yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = data
      .map((r, i) => {
        const rs =
          r.rank === 1
            ? "background:#fef3c7;color:#b45309;"
            : r.rank === 2
            ? "background:#f1f5f9;color:#475569;"
            : r.rank === 3
            ? "background:#fff7ed;color:#c2410c;"
            : "";
        const vis = !rank || r.rank <= rank ? "" : `style="display:none"`;
        return `<tr data-event="${esc(r.event_name || "")}" data-school="${esc(
          r.school_name || ""
        )}" data-rank="${r.rank || 999}" data-group="${esc(
          r.group_id || ""
        )}" ${vis} style="animation:rowIn .25s ease ${i * 0.03}s both">
        <td><span class="rank-badge" style="${rs}">#${r.rank ?? "-"}</span></td>
        <td><strong style="color:#1e293b">${esc(
          r.student_name ?? "-"
        )}</strong></td>
        <td>${esc(r.school_name ?? "-")}</td>
        <td><span class="event-badge">${esc(r.event_name ?? "-")}</span></td>
        <td>${esc(r.group_id ?? "-")}</td>
        <td><code style="font-size:11px;color:#94a3b8">${esc(
          r.unique_id ?? "-"
        )}</code></td>
        <td><span class="score-val">${r.total_score ?? 0}</span></td>
      </tr>`;
      })
      .join("");
  } catch (_) {}
};

async function loadFilters() {
  try {
    const [events, groups, schools] = await Promise.all([
      fetch("/api/events", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/groups", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/schools", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => []),
    ]);
    addUniqueOptions(document.getElementById("eventFilter"), events, "event");
    addUniqueOptions(
      document.getElementById("groupFilter"),
      groups,
      "group_id"
    );
    addUniqueOptions(
      document.getElementById("schoolFilter"),
      schools,
      "school"
    );
  } catch (_) {}
}

function applyRankFilter() {
  const rank = parseInt(document.getElementById("rankFilter")?.value || "0");
  document.querySelectorAll("#leaderboardBody tr[data-rank]").forEach((r) => {
    r.style.display =
      !rank || parseInt(r.dataset.rank || "999") <= rank ? "" : " none";
  });
}

window.exportLeaderboard = function () {
  const rows = Array.from(
    document.querySelectorAll("#leaderboardBody tr")
  ).filter((r) => r.style.display !== "none");
  const csv = ["Rank,Student,School,Event,Group,Unique ID,Score"];
  rows.forEach((r) => {
    const c = r.querySelectorAll("td");
    if (c.length >= 7)
      csv.push(
        [...c]
          .slice(0, 7)
          .map((x) => `"${x.textContent.trim()}"`)
          .join(",")
      );
  });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv.join("\n")], { type: "text/csv" })),
    download: "leaderboard.csv",
  });
  a.click();
};

// ════════════════════════════════════════════════════════════════════════════
// PREMIUM ANALYTICS — SVG charts, donut rings, score dist, inline, no deps
// ════════════════════════════════════════════════════════════════════════════

const AN_PALETTE = [
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#ec4899",
  "#eab308",
  "#6366f1",
  "#14b8a6",
  "#f43f5e",
  "#a855f7",
];
const AN_SCH_PAL = [
  "#f97316",
  "#eab308",
  "#22c55e",
  "#6366f1",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#14b8a6",
];

/** Build SVG donut: data=[{label,value,color}], size px, strokeW px */
function buildDonut(data, total, size, sw, cLabel, cSub) {
  const cx = size / 2,
    cy = size / 2,
    r = (size - sw * 2) / 2;
  const gap = total > 0 ? 1.5 : 0;
  let cursor = 0;
  const arcs = data
    .map((d, i) => {
      const deg = total > 0 ? (d.value / total) * (360 - gap * data.length) : 0;
      if (deg < 0.5) {
        cursor += deg + gap;
        return "";
      }
      const s = ((cursor - 90) * Math.PI) / 180,
        e = ((cursor + deg - 90) * Math.PI) / 180;
      const x1 = cx + r * Math.cos(s),
        y1 = cy + r * Math.sin(s);
      const x2 = cx + r * Math.cos(e),
        y2 = cy + r * Math.sin(e);
      const la = deg > 180 ? 1 : 0;
      const circ = 2 * Math.PI * r,
        fill = (deg / 360) * circ;
      cursor += deg + gap;
      return `<path d="M${x1.toFixed(2)},${y1.toFixed(
        2
      )} A${r},${r} 0 ${la},1 ${x2.toFixed(2)},${y2.toFixed(2)}"
      fill="none" stroke="${
        d.color
      }" stroke-width="${sw}" stroke-linecap="round"
      style="stroke-dasharray:${fill.toFixed(2)} ${circ.toFixed(
        2
      )};animation:an_dashIn .9s ease ${i * 0.1}s both"/>`;
    })
    .join("");
  const fSize = size > 110 ? 20 : 15;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;flex-shrink:0">
    <style>@keyframes an_dashIn{from{stroke-dashoffset:var(--d,300)}to{stroke-dashoffset:0}}</style>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="${sw}"/>
    ${arcs}
    <text x="${cx}" y="${
    cy - 6
  }" text-anchor="middle" dominant-baseline="middle" style="font-size:${fSize}px;font-weight:800;fill:#fff">${cLabel}</text>
    <text x="${cx}" y="${
    cy + fSize * 0.85
  }" text-anchor="middle" dominant-baseline="middle" style="font-size:9px;fill:rgba(255,255,255,.35)">${cSub}</text>
  </svg>`;
}

/** Build one KPI card with SVG ring */
function buildKpiCard(pct, value, label, sub, color, glow, delay) {
  const r = 26,
    circ = 2 * Math.PI * r,
    fill = Math.min(pct / 100, 1) * circ;
  const trend =
    pct >= 80
      ? `<span style="background:rgba(34,197,94,.15);color:#4ade80;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-top:5px">On Track</span>`
      : pct >= 40
      ? `<span style="background:rgba(234,179,8,.12);color:#facc15;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-top:5px">In Progress</span>`
      : `<span style="background:rgba(239,68,68,.12);color:#f87171;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-top:5px">Needs Attention</span>`;
  return `<div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:20px;display:flex;align-items:center;gap:16px;animation:an_fadeUp .4s ease ${delay}s both;transition:transform .2s,box-shadow .2s;position:relative;overflow:hidden" onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 40px rgba(0,0,0,.4)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">
    <div style="position:absolute;inset:0;border-radius:inherit;background:radial-gradient(circle at 80% 20%,${glow} 0%,transparent 60%);pointer-events:none"></div>
    <div style="position:relative;width:72px;height:72px;flex-shrink:0">
      <svg width="72" height="72" viewBox="0 0 72 72" style="transform:rotate(-90deg);overflow:visible">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${fill.toFixed(2)} ${circ.toFixed(2)}"
          style="animation:an_ringFill 1.2s ease ${delay}s both"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-size:15px;font-weight:800;color:#fff;line-height:1">${pct}%</span>
        <span style="font-size:9px;color:rgba(255,255,255,.35);margin-top:1px">done</span>
      </div>
    </div>
    <div style="flex:1;min-width:0;position:relative">
      <div style="font-size:28px;font-weight:800;color:#fff;line-height:1;margin-bottom:2px">${
        typeof value === "number" ? value.toLocaleString() : value
      }</div>
      <div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${label}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.5)">${sub}</div>
      ${trend}
    </div>
  </div>`;
}

window.loadAnalytics = async function () {
  const container = document.getElementById("analytics-content");
  if (!container) return;
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:80px;color:rgba(255,255,255,.3);font-size:14px"><div class="spin-sm"></div>Crunching numbers...</div>`;

  // ── Global keyframes injected once ─────────────────────────────────────────
  if (!document.getElementById("an-keyframes")) {
    const st = document.createElement("style");
    st.id = "an-keyframes";
    st.textContent = `
      @keyframes an_fadeUp  {from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
      @keyframes an_fadeIn  {from{opacity:0}to{opacity:1}}
      @keyframes an_barGrow {from{width:0}to{width:var(--w,0%)}}
      @keyframes an_ringFill{from{stroke-dasharray:0 300}to{}}
      @keyframes an_pulse   {0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.5)}70%{box-shadow:0 0 0 10px transparent}}
    `;
    document.head.appendChild(st);
  }

  try {
    const [dash, lb, att] = await Promise.all([
      fetch("/admin/dashboard-data", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => ({})),
      fetch("/api/leaderboard", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/attendance-stats", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => ({})),
    ]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const attPct =
      att.overall?.total > 0
        ? Math.round((att.overall.present / att.overall.total) * 100)
        : 0;
    const scorePct =
      (dash.totalStudents || 0) > 0
        ? Math.round(((dash.scoredStudents || 0) / dash.totalStudents) * 100)
        : 0;
    const roomPct =
      (dash.totalRooms || 0) > 0
        ? Math.round(((dash.closedRooms || 0) / dash.totalRooms) * 100)
        : 0;
    const judgePct =
      (dash.totalJudges || 0) > 0
        ? Math.round(((dash.completedJudges || 0) / dash.totalJudges) * 100)
        : 0;

    const eventMap = {};
    (lb || []).forEach((r) => {
      if (!eventMap[r.event_name]) eventMap[r.event_name] = 0;
      eventMap[r.event_name]++;
    });
    const eventEntries = Object.entries(eventMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const maxEv = Math.max(...eventEntries.map((e) => e[1]), 1);

    const schoolMap = {};
    (lb || []).forEach((r) => {
      if (!schoolMap[r.school_name])
        schoolMap[r.school_name] = { total: 0, count: 0 };
      schoolMap[r.school_name].total += Number(r.total_score || 0);
      schoolMap[r.school_name].count++;
    });
    const schoolList = Object.entries(schoolMap)
      .map(([s, d]) => ({
        name: s,
        total: d.total,
        avg: d.count ? Math.round(d.total / d.count) : 0,
        count: d.count,
      }))
      .sort((a, b) => b.total - a.total);
    const maxSch = Math.max(...schoolList.map((s) => s.total), 1);

    const top5 = [...(lb || [])]
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 5);

    const buckets = [0, 0, 0, 0, 0];
    const bColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];
    const bLabels = ["0–20", "21–40", "41–60", "61–80", "81+"];
    (lb || []).forEach((r) => {
      const s = Number(r.total_score || 0);
      if (s <= 20) buckets[0]++;
      else if (s <= 40) buckets[1]++;
      else if (s <= 60) buckets[2]++;
      else if (s <= 80) buckets[3]++;
      else buckets[4]++;
    });
    const maxB = Math.max(...buckets, 1);
    const totalScored = buckets.reduce((a, b) => a + b, 0);

    const attDonut = [
      { label: "Present", value: att.overall?.present || 0, color: "#22c55e" },
      { label: "Absent", value: att.overall?.absent || 0, color: "#ef4444" },
    ];
    const distDonut = buckets.map((v, i) => ({
      label: bLabels[i],
      value: v,
      color: bColors[i],
    }));

    const eta = await computeETA();

    // ── RENDER ────────────────────────────────────────────────────────────────
    container.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:24px;padding:24px 28px;background:linear-gradient(135deg,#0d0d1a,#1a1133 50%,#0d1a30);border-radius:20px;border:1px solid rgba(249,115,22,.15);position:relative;overflow:hidden;animation:an_fadeIn .4s ease">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at top right,rgba(249,115,22,.1) 0%,transparent 60%),radial-gradient(ellipse at bottom left,rgba(99,102,241,.06) 0%,transparent 60%);pointer-events:none"></div>
      <div style="position:relative">
        <div style="font-family:'Cinzel',Georgia,serif;font-size:19px;font-weight:700;color:#fdba74;display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <svg width="16" height="16" fill="none" stroke="#f97316" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Event Analytics — ISKCON NRJD Nandotsav 2025
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,.35)">Last updated: ${new Date().toLocaleTimeString()} · Auto-refreshes every 10s</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;position:relative">
        <button onclick="exportFullReport()" style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;background:linear-gradient(135deg,#f97316,#eab308);color:#1a0a2e;font-size:12px;font-weight:700;border:none;cursor:pointer;font-family:inherit">Export Full Report</button>
        <button onclick="printLeaderboard()" style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Print</button>
      </div>
    </div>

    <!-- ETA -->
    <div style="display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(249,115,22,.07);border:1px solid rgba(249,115,22,.18);border-radius:12px;margin-bottom:24px;animation:an_fadeUp .3s ease .1s both">
      <div style="width:8px;height:8px;border-radius:50%;background:#f97316;animation:an_pulse 1.5s infinite;flex-shrink:0"></div>
      <span style="font-size:12px;color:rgba(255,255,255,.4)">Estimated completion:</span>
      <strong style="font-size:13px;color:#fdba74">${eta}</strong>
      <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,.25)">${totalScored} scored · ${
      (dash.totalStudents || 0) - (dash.scoredStudents || 0)
    } remaining</span>
    </div>

    <!-- KPI Row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
      ${buildKpiCard(
        attPct,
        att.overall?.present || 0,
        "Attendance",
        `${att.overall?.present || 0} / ${att.overall?.total || 0} students`,
        "#22c55e",
        "rgba(34,197,94,.08)",
        0
      )}
      ${buildKpiCard(
        scorePct,
        dash.scoredStudents || 0,
        "Scoring Done",
        `${dash.scoredStudents || 0} / ${dash.totalStudents || 0} judged`,
        "#6366f1",
        "rgba(99,102,241,.08)",
        0.1
      )}
      ${buildKpiCard(
        roomPct,
        dash.closedRooms || 0,
        "Rooms Closed",
        `${dash.openRooms || 0} still open`,
        "#f97316",
        "rgba(249,115,22,.08)",
        0.2
      )}
      ${buildKpiCard(
        judgePct,
        dash.completedJudges || 0,
        "Judges Done",
        `${dash.assignedJudges || 0} assigned total`,
        "#8b5cf6",
        "rgba(139,92,246,.08)",
        0.3
      )}
    </div>

    <!-- Row 2: Top 5 + Attendance Donut -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:20px">
      <!-- Top 5 -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .15s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#f97316"></div>Top Performers</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">by total score</span>
        </div>
        <div style="padding:4px 22px 18px">
          ${
            top5.length > 0
              ? top5
                  .map((s, i) => {
                    const medals = ["🥇", "🥈", "🥉", "④", "⑤"];
                    const hue = (s.student_name.charCodeAt(0) * 17) % 360;
                    const init = s.student_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);animation:an_fadeUp .3s ease ${
                      i * 0.07
                    }s both">
              <div style="width:24px;font-size:14px;text-align:center;flex-shrink:0">${
                medals[i] || i + 1
              }</div>
              <div style="width:34px;height:34px;border-radius:10px;background:hsl(${hue},60%,45%);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">${init}</div>
              <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(
                s.student_name
              )}</div><div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:1px">${esc(
                      s.event_name
                    )} · ${esc(s.school_name)}</div></div>
              <div style="font-size:18px;font-weight:800;background:linear-gradient(135deg,#f97316,#eab308);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;flex-shrink:0">${
                s.total_score
              }</div>
            </div>`;
                  })
                  .join("")
              : `<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px">No scores yet</div>`
          }
        </div>
      </div>
      <!-- Attendance Donut -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .2s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#22c55e"></div>Attendance</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${attPct}%</span>
        </div>
        <div style="padding:20px 22px;display:flex;flex-direction:column;align-items:center;gap:16px">
          <div style="display:flex;align-items:center;gap:16px;width:100%">
            ${buildDonut(
              attDonut,
              att.overall?.total || 0,
              110,
              12,
              attPct + "%",
              "present"
            )}
            <div style="flex:1">
              ${attDonut
                .map(
                  (d) =>
                    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px"><div style="width:10px;height:10px;border-radius:3px;background:${d.color};flex-shrink:0"></div><span style="font-size:12px;color:rgba(255,255,255,.5);flex:1">${d.label}</span><span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.8)">${d.value}</span></div>`
                )
                .join("")}
            </div>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${attPct}%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:99px;transition:width 1s ease"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 3: Event bars + Score distribution -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <!-- Event bars -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .25s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#8b5cf6"></div>Participants by Event</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${
            eventEntries.length
          } events</span>
        </div>
        <div style="padding:16px 22px;display:flex;flex-direction:column;gap:11px">
          ${
            eventEntries.length > 0
              ? eventEntries
                  .map(
                    ([ev, cnt], i) => `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:10px;color:rgba(255,255,255,.25);width:14px;flex-shrink:0">${
                i + 1
              }</span>
              <span style="font-size:11px;color:rgba(255,255,255,.5);width:90px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(
                ev
              )}">${esc(ev)}</span>
              <div style="flex:1;background:rgba(255,255,255,.05);border-radius:99px;height:8px;overflow:hidden">
                <div style="height:100%;width:${Math.round(
                  (cnt / maxEv) * 100
                )}%;background:${
                      AN_PALETTE[i % AN_PALETTE.length]
                    };border-radius:99px;animation:an_barGrow .9s ease ${
                      i * 0.07
                    }s both;--w:${Math.round((cnt / maxEv) * 100)}%"></div>
              </div>
              <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);width:24px;text-align:right;flex-shrink:0">${cnt}</span>
            </div>`
                  )
                  .join("")
              : `<div style="text-align:center;padding:24px;color:rgba(255,255,255,.2);font-size:13px">No data yet</div>`
          }
        </div>
      </div>
      <!-- Score distribution -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .3s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#06b6d4"></div>Score Distribution</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${totalScored} scored</span>
        </div>
        <div style="padding:20px 22px">
          ${
            totalScored > 0
              ? `
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
            ${buildDonut(distDonut, totalScored, 100, 11, totalScored, "total")}
            <div style="flex:1">
              ${distDonut
                .map(
                  (d, i) =>
                    `<div style="display:flex;align-items:center;gap:7px;margin-bottom:7px"><div style="width:8px;height:8px;border-radius:2px;background:${d.color};flex-shrink:0"></div><span style="font-size:11px;color:rgba(255,255,255,.4);flex:1">${d.label}</span><span style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7)">${d.value}</span></div>`
                )
                .join("")}
            </div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:64px">
            ${buckets
              .map((cnt, i) => {
                const h =
                  maxB > 0
                    ? Math.max(Math.round((cnt / maxB) * 58), cnt > 0 ? 4 : 0)
                    : 0;
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:9px;color:rgba(255,255,255,.35)">${
                  cnt || ""
                }</span><div style="width:100%;height:${h}px;background:${
                  bColors[i]
                };border-radius:4px 4px 0 0;min-height:${
                  cnt > 0 ? 4 : 0
                }px"></div></div>`;
              })
              .join("")}
          </div>
          <div style="display:flex;margin-top:4px">${bLabels
            .map(
              (l) =>
                `<span style="flex:1;text-align:center;font-size:9px;color:rgba(255,255,255,.2)">${l}</span>`
            )
            .join("")}</div>
          `
              : `<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px">No scores yet</div>`
          }
        </div>
      </div>
    </div>

    <!-- Row 4: School performance table + Room rings -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <!-- School table -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .35s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#ec4899"></div>School Performance</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${
            schoolList.length
          } schools</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>${["#", "School", "Att%", "Avg", "Score"]
              .map(
                (h) =>
                  `<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.25);border-bottom:1px solid rgba(255,255,255,.05)">${h}</th>`
              )
              .join("")}</tr></thead>
            <tbody>
              ${
                schoolList.length > 0
                  ? schoolList
                      .slice(0, 8)
                      .map((sc, i) => {
                        const attRow = (att.bySchool || []).find(
                          (a) => a.school_name === sc.name
                        );
                        const aP = attRow ? attRow.attendance_pct : 0;
                        const attCol =
                          aP >= 80
                            ? "#4ade80"
                            : aP >= 50
                            ? "#facc15"
                            : "#f87171";
                        const barW = Math.round((sc.total / maxSch) * 100);
                        return `<tr style="animation:an_fadeUp .3s ease ${
                          i * 0.06
                        }s both" onmouseenter="this.style.background='rgba(255,255,255,.02)'" onmouseleave="this.style.background=''">
                  <td style="padding:10px 14px;font-size:11px;color:rgba(255,255,255,.2);border-bottom:1px solid rgba(255,255,255,.04)">${
                    i + 1
                  }</td>
                  <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04)"><div style="display:flex;align-items:center;gap:8px"><div style="width:6px;height:6px;border-radius:50%;background:${
                    AN_SCH_PAL[i % AN_SCH_PAL.length]
                  };flex-shrink:0"></div><span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.8)">${esc(
                          sc.name
                        )}</span></div></td>
                  <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04)"><span style="background:${
                    aP >= 80
                      ? "rgba(34,197,94,.12)"
                      : aP >= 50
                      ? "rgba(234,179,8,.12)"
                      : "rgba(239,68,68,.12)"
                  };color:${attCol};font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${aP}%</span></td>
                  <td style="padding:10px 14px;font-weight:700;font-size:12px;color:rgba(255,255,255,.8);border-bottom:1px solid rgba(255,255,255,.04)">${
                    sc.avg
                  }</td>
                  <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04)">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden;min-width:50px"><div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:99px;transition:width .8s ease"></div></div>
                      <span style="font-size:11px;font-weight:700;color:#fdba74;min-width:28px;text-align:right">${
                        sc.total
                      }</span>
                    </div>
                  </td>
                </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="5" style="text-align:center;padding:32px;color:rgba(255,255,255,.2);font-size:13px">No scores yet</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
      <!-- Room progress rings -->
      <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .4s both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#eab308"></div>Room Progress</div>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${
            (dash.rooms || []).length
          } rooms</span>
        </div>
        <div style="padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
          ${
            (dash.rooms || [])
              .map((r) => {
                const p =
                  r.totalStudents > 0
                    ? Math.round((r.scoredStudents / r.totalStudents) * 100)
                    : 0;
                const col =
                  r.status === "closed"
                    ? "#22c55e"
                    : r.judge_done
                    ? "#6366f1"
                    : "#f97316";
                const statusL =
                  r.status === "closed"
                    ? "Closed"
                    : r.judge_done
                    ? "Ready"
                    : "Open";
                const rr = 16,
                  circ2 = 2 * Math.PI * rr,
                  fill2 = (p / 100) * circ2;
                return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;transition:.2s" onmouseenter="this.style.background='rgba(255,255,255,.05)'" onmouseleave="this.style.background='rgba(255,255,255,.03)'">
              <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(
                r.room_number
              )}</div>
              <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(
                r.event_name
              )}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <svg width="44" height="44" viewBox="0 0 44 44" style="flex-shrink:0;overflow:visible">
                  <circle cx="22" cy="22" r="${rr}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="4"/>
                  <circle cx="22" cy="22" r="${rr}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"
                    stroke-dasharray="${fill2.toFixed(2)} ${circ2.toFixed(
                  2
                )}" transform="rotate(-90 22 22)"
                    style="transition:stroke-dasharray 1s ease"/>
                  <text x="22" y="22" text-anchor="middle" dominant-baseline="middle" style="font-size:9px;font-weight:800;fill:${col}">${p}%</text>
                </svg>
                <div><div style="font-size:13px;font-weight:800;color:#fff;line-height:1">${
                  r.scoredStudents
                }/${
                  r.totalStudents
                }</div><div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:2px">${statusL}</div></div>
              </div>
            </div>`;
              })
              .join() ||
            `<div style="text-align:center;padding:32px;color:rgba(255,255,255,.2);font-size:13px;grid-column:1/-1">No rooms yet</div>`
          }
        </div>
      </div>
    </div>

    <!-- Row 5: Event attendance table -->
    ${
      (att.byEvent || []).length > 0
        ? `
    <div style="background:linear-gradient(145deg,#1a1a2e,#151528);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;animation:an_fadeUp .4s ease .45s both">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"><div style="width:6px;height:6px;border-radius:50%;background:#14b8a6"></div>Attendance by Event</div>
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">${
          (att.byEvent || []).length
        } events</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>${[
            "#",
            "Event",
            "Total",
            "Present",
            "Absent",
            "Rate",
            "Progress",
          ]
            .map(
              (h) =>
                `<th style="padding:8px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.25);border-bottom:1px solid rgba(255,255,255,.05)">${h}</th>`
            )
            .join("")}</tr></thead>
          <tbody>
            ${(att.byEvent || [])
              .map((ev, i) => {
                const col =
                  ev.attendance_pct >= 80
                    ? "#4ade80"
                    : ev.attendance_pct >= 50
                    ? "#facc15"
                    : "#f87171";
                const bgCol =
                  ev.attendance_pct >= 80
                    ? "rgba(34,197,94,.12)"
                    : ev.attendance_pct >= 50
                    ? "rgba(234,179,8,.12)"
                    : "rgba(239,68,68,.12)";
                return `<tr style="animation:an_fadeUp .3s ease ${
                  i * 0.05
                }s both" onmouseenter="this.style.background='rgba(255,255,255,.02)'" onmouseleave="this.style.background=''">
                <td style="padding:10px 16px;font-size:11px;color:rgba(255,255,255,.2);border-bottom:1px solid rgba(255,255,255,.04)">${
                  i + 1
                }</td>
                <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)"><div style="display:flex;align-items:center;gap:8px"><div style="width:6px;height:6px;border-radius:50%;background:${
                  AN_PALETTE[i % AN_PALETTE.length]
                };flex-shrink:0"></div><span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.8)">${esc(
                  ev.event_name
                )}</span></div></td>
                <td style="padding:10px 16px;font-size:12px;color:rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.04)">${
                  ev.total
                }</td>
                <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#4ade80;border-bottom:1px solid rgba(255,255,255,.04)">${
                  ev.present
                }</td>
                <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#f87171;border-bottom:1px solid rgba(255,255,255,.04)">${
                  ev.absent
                }</td>
                <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)"><span style="background:${bgCol};color:${col};font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${
                  ev.attendance_pct
                }%</span></td>
                <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);min-width:120px">
                  <div style="height:6px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${
                      ev.attendance_pct
                    }%;background:${
                  AN_PALETTE[i % AN_PALETTE.length]
                };border-radius:99px;transition:width 1s ease ${
                  i * 0.05
                }s"></div>
                  </div>
                </td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`
        : ""
    }
    `;
  } catch (err) {
    console.error("loadAnalytics:", err);
    const c2 = document.getElementById("analytics-content");
    if (c2)
      c2.innerHTML = `<div style="padding:48px;text-align:center;color:#ef4444;font-size:14px">Failed to load analytics: ${esc(
        err.message
      )}</div>`;
  }
};

// ── Judge autocomplete ────────────────────────────────────────────────────────
function initJudgeAutocomplete() {
  const ni = document.getElementById("judgeName"),
    ei = document.getElementById("judgeEmail");
  if (!ni || !ei) return;
  function tryFill(val, field) {
    if (!val || val.length < 2) return;
    const m = allJudges.find((j) =>
      field === "name"
        ? j.name.toLowerCase().includes(val.toLowerCase())
        : (j.email || "").toLowerCase().includes(val.toLowerCase())
    );
    if (!m) return;
    ni.value = m.name;
    ei.value = m.email || "";
    const re = document.getElementById("roomNo");
    if (re && !re.value) {
      re.focus();
      adminToast(`Found: ${m.name} — update the room.`, "info");
    }
  }
  ni.addEventListener("blur", () => tryFill(ni.value, "name"));
  ei.addEventListener("blur", () => tryFill(ei.value, "email"));
}
function prefillReassign(name, email) {
  const ni = document.getElementById("judgeName"),
    ei = document.getElementById("judgeEmail"),
    ri = document.getElementById("roomNo");
  if (ni) ni.value = name;
  if (ei) ei.value = email;
  if (ri) ri.value = "";
  switchView("assignments");
  adminToast(`Prefilled ${name}. Enter new room.`, "info");
  setTimeout(() => ri?.focus(), 150);
}
function switchView(viewId) {
  document
    .querySelectorAll(".nav-item[data-view]")
    .forEach((i) => i.classList.remove("active"));
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelector(`.nav-item[data-view="${viewId}"]`)
    ?.classList.add("active");
  document.getElementById(`view-${viewId}`)?.classList.add("active");
  const labels = {
    overview: "Overview",
    analytics: "Analytics",
    students: "Students",
    uploadcsv: "Upload CSV",
    assignments: "Rooms & Judges",
    messages: "Messages",
    scores: "Leaderboard",
    attendance: "Attendance",
  };
  const t = document.getElementById("topbarTitle");
  if (t) t.textContent = labels[viewId] || viewId;
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar"),
    overlay = document.getElementById("sidebarOverlay"),
    hamburger = document.getElementById("hamburger"),
    sbClose = document.getElementById("sidebarClose");
  const openSB = () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("visible");
  };
  const closeSB = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("visible");
  };
  hamburger?.addEventListener("click", openSB);
  sbClose?.addEventListener("click", closeSB);
  overlay?.addEventListener("click", closeSB);

  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const v = item.dataset.view;
      switchView(v);
      closeSB();
      if (v === "messages") refreshMessages();
      if (v === "scores") {
        loadFilters().then(loadLeaderboard);
      }
      if (v === "assignments") fetchDashboard();
      if (v === "attendance") window.loadAttendanceDashboard?.();
      if (v === "analytics") window.loadAnalytics?.();
    });
  });

  document.querySelectorAll("[data-judge-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-judge-filter]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      judgeFilter = btn.dataset.judgeFilter;
      renderJudgesTable(allJudges);
    });
  });

  document
    .getElementById("admin-msg-send")
    ?.addEventListener("click", sendAdminMessage);
  document
    .getElementById("admin-msg-input")
    ?.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAdminMessage();
      }
    });
  document
    .getElementById("msg-recipient")
    ?.addEventListener("change", refreshMessages);
  ["eventFilter", "groupFilter", "schoolFilter"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", loadLeaderboard)
  );
  document
    .getElementById("rankFilter")
    ?.addEventListener("change", applyRankFilter);

  initThemeToggle();
  fetchDashboard();
  loadFilters().then(loadLeaderboard);

  setInterval(fetchDashboard, 10000);
  setInterval(pollUnread, 7000);
  setInterval(updateAdminAnnBanner, 10000);
  setInterval(refreshMessages, 12000);
  setInterval(renderHelpRequests, 8000);
  setTimeout(initJudgeAutocomplete, 1500);
});
