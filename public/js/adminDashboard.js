// public/js/adminDashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const totalRoomsEl = document.getElementById("totalRooms");
  const openRoomsEl = document.getElementById("openRooms");
  const closedRoomsEl = document.getElementById("closedRooms");
  const totalJudgesEl = document.getElementById("totalJudges");
  const assignedJudgesEl = document.getElementById("assignedJudges");
  const completedJudgesEl = document.getElementById("completedJudges");
  const roomDetailsContainer = document.getElementById("roomDetailsContainer");
  const dashboardAlerts = document.getElementById("dashboardAlerts");
  const dashboardAlerts1 = document.getElementById("dashboardAlerts1");

  async function fetchDashboardData() {
    try {
      const res = await fetch("/admin/dashboard-data", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error(
          "Dashboard fetch failed. Status:",
          res.status,
          "Body:",
          txt
        );
        dashboardAlerts.innerHTML = `<p class="alert">Failed to load alerts (status ${res.status})</p>`;
        return;
      }

      // defensive: check content-type
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const txt = await res.text();
        console.error("Expected JSON but got:", ct, txt.slice(0, 200));
        dashboardAlerts.innerHTML = `<p class="alert">Invalid response from server</p>`;
        return;
      }

      const data = await res.json();

      // debug: log alerts we received
      console.log("Dashboard data received. alerts:", data.alerts);

      // update counters
      totalRoomsEl.textContent = data.totalRooms;
      openRoomsEl.textContent = data.openRooms;
      closedRoomsEl.textContent = data.closedRooms;
      totalJudgesEl.textContent = data.totalJudges;
      assignedJudgesEl.textContent = data.assignedJudges;
      completedJudgesEl.textContent = data.completedJudges;

      // rooms
      roomDetailsContainer.innerHTML = "";
      (data.rooms || []).forEach((room) => {
        const div = document.createElement("div");
        div.className = "room-card";
        const judgesHtml = (room.judges || [])
          .map(
            (j) =>
              `<span class="badge ${
                j.assignment_status === "completed" ? "completed" : "pending"
              }" title="${j.email}">${escapeHtml(j.name)}</span>`
          )
          .join(" ");
        const progress = Math.round(
          (room.assignedCount / Math.max(1, room.capacity)) * 100
        );
        div.innerHTML = `
          <div class="room-head">
            <strong>${escapeHtml(
              room.room_number
            )}</strong> <small>${escapeHtml(room.event_name || "")}</small>
            <div>${room.status || "open"}</div>
          </div>
          <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%"></div></div>
          <div class="room-meta">Assigned: <strong>${
            room.assignedCount
          }</strong> / ${room.capacity}</div>
          <div class="room-judges">${judgesHtml || "<em>No judges</em>"}</div>
        `;
        roomDetailsContainer.appendChild(div);
      });

      // alerts (latest)
      dashboardAlerts.innerHTML = "";
      if (!data.alerts || data.alerts.length === 0) {
        dashboardAlerts.innerHTML = '<p class="muted">No alerts</p>';
      } else {
        data.alerts.forEach((msg) => {
          const p = document.createElement("p");
          p.className = "alert-item";
          p.textContent = msg;
          dashboardAlerts.appendChild(p);
        });
      }

      dashboardAlerts1.innerHTML = "";
      if (!data.alerts || data.alerts.length === 0) {
        dashboardAlerts1.innerHTML = '<p class="muted">No alerts</p>';
      } else {
        data.alerts.forEach((msg) => {
          const p = document.createElement("p");
          p.className = "alert-item";
          p.textContent = msg;
          dashboardAlerts1.appendChild(p);
        });
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
      dashboardAlerts.innerHTML = `<p class="alert">Error loading dashboard</p>`;
    }
  }

  // escape util
  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }

  // initial + periodic refresh
  fetchDashboardData();
  setInterval(fetchDashboardData, 10000);
});

//Leaderboard
// public/adminDashboard.js (partial)
async function loadStats() {
  try {
    const res = await fetch("/api/dashboard-stats"); // match server mount
    const text = await res.text(); // always read text first

    if (!res.ok) {
      console.error("HTTP error", res.status, res.statusText);
      console.log("Raw response (first 400 chars):", text.slice(0, 400));
      return;
    }

    // try parse JSON, but if it's HTML we'll log it and bail
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Expected JSON but got non-JSON response:", e);
      console.log("Raw response (first 800 chars):", text.slice(0, 800));
      return;
    }

    // update UI (IDs from your EJS)
    document.getElementById("total-students").textContent =
      data.total_students ?? 0;
    document.getElementById("judged-students").textContent =
      data.judged_students ?? 0;
    document.getElementById("completion").textContent =
      (data.completion ?? 0) + "%";
  } catch (err) {
    console.error("loadStats() failed:", err);
  }
}

// initial load + auto refresh every 10s
loadStats();
setInterval(loadStats, 10000);
// Utility to safely fetch JSON
async function safeGetJSON(url) {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    console.error("HTTP error:", res.status, res.statusText);
    console.log("Raw response:", text.slice(0, 500));
    return [];
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("JSON parse error:", err);
    console.log("Raw response:", text.slice(0, 800));
    return [];
  }
}

// Load filters for Event and Group
async function loadFilters() {
  try {
    // Load Events
    const events = await safeGetJSON("/api/events");
    const eventFilter = document.getElementById("eventFilter");
    if (eventFilter) {
      eventFilter.innerHTML = `<option value="">All Events</option>`;
      events.forEach((ev) => {
        eventFilter.innerHTML += `<option value="${ev.event}">${ev.event}</option>`;
      });
    }

    // Load Groups
    const groups = await safeGetJSON("/api/groups");
    const groupFilter = document.getElementById("groupFilter");
    if (groupFilter) {
      groupFilter.innerHTML = `<option value="">All Groups</option>`;
      groups.forEach((gr) => {
        groupFilter.innerHTML += `<option value="${gr.group_id}">${gr.group_id}</option>`;
      });
    }
  } catch (err) {
    console.error("Error loading filters:", err);
  }
}

// Load leaderboard table
async function loadLeaderboard() {
  try {
    const eventFilter = document.getElementById("eventFilter");
    const groupFilter = document.getElementById("groupFilter");

    const eventId = eventFilter ? eventFilter.value : "";
    const groupId = groupFilter ? groupFilter.value : "";

    let url = "/api/leaderboard?";
    if (eventId) url += `event_id=${encodeURIComponent(eventId)}&`;
    if (groupId) url += `group_id=${encodeURIComponent(groupId)}&`;

    const data = await safeGetJSON(url);

    const tbody = document.getElementById("leaderboardBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (data.length > 0) {
      data.forEach((row) => {
        tbody.innerHTML += `
          <tr>
            <td>#${row.rank}</td>
            <td>${row.student_name}</td>
            <td>${row.school_name}</td>
            <td>${row.event_name}</td>
            <td>${row.group_id}</td>
            <td>${row.unique_id}</td>
            <td>${row.total_score}</td>
          </tr>
        `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7">No results found</td></tr>`;
    }
  } catch (err) {
    console.error("Error loading leaderboard:", err);
  }
}

// Initialize dashboard
document.addEventListener("DOMContentLoaded", () => {
  loadFilters();
  loadLeaderboard();

  document
    .getElementById("eventFilter")
    ?.addEventListener("change", loadLeaderboard);
  document
    .getElementById("groupFilter")
    ?.addEventListener("change", loadLeaderboard);

  setInterval(loadLeaderboard, 10000);
});
