// public/js/admin.js — Production Grade
"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${
      { success: "✓", error: "✕", info: "i", warn: "!" }[type] || "i"
    }</strong><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  function escHtml(s) {
    return String(s || "").replace(
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

  // ── Rooms cache ─────────────────────────────────────────────────────────────
  let eventRoomsCache = {};
  let allRoomsFlat = [];

  async function loadRoomsCache() {
    try {
      const rooms = await fetch("/api/all-rooms", {
        credentials: "include",
      }).then((r) => r.json());
      allRoomsFlat = rooms || [];
      eventRoomsCache = {};
      allRoomsFlat.forEach((r) => {
        const key = (r.event_name || "").trim().toLowerCase();
        if (!eventRoomsCache[key]) eventRoomsCache[key] = [];
        eventRoomsCache[key].push(r);
      });
      updateGlobalRoomDatalist();
    } catch (_) {}
  }

  function updateGlobalRoomDatalist() {
    const dl = document.getElementById("room-datalist");
    if (!dl) return;
    dl.innerHTML = allRoomsFlat
      .map(
        (r) =>
          `<option value="${escHtml(r.room_number)}">${escHtml(
            r.room_number
          )} — ${escHtml(r.event_name)}</option>`
      )
      .join("");
  }

  function getRoomsForEvent(eventName) {
    return eventRoomsCache[(eventName || "").trim().toLowerCase()] || [];
  }

  // ── Student table filters ───────────────────────────────────────────────────
  const tbody = document.getElementById("studentTableBody");
  const searchInput = document.getElementById("studentSearchInput");
  const evF = document.getElementById("eventFilterStudents");
  const scF = document.getElementById("schoolFilterStudents");

  if (tbody) {
    const events = new Set(),
      schools = new Set();
    tbody.querySelectorAll("tr").forEach((r) => {
      if (r.dataset.event) events.add(r.dataset.event);
      if (r.dataset.school) schools.add(r.dataset.school);
    });
    if (evF) events.forEach((e) => evF.add(new Option(e, e)));
    if (scF) schools.forEach((s) => scF.add(new Option(s, s)));
    evF?.addEventListener("change", applyStudentFilters);
    scF?.addEventListener("change", applyStudentFilters);
    searchInput?.addEventListener("input", applyStudentFilters);
  }

  function applyStudentFilters() {
    if (!tbody) return;
    const ev = evF?.value || "";
    const sc = scF?.value || "";
    const term = (searchInput?.value || "").toLowerCase();
    tbody.querySelectorAll("tr").forEach((r) => {
      const ok =
        (!ev || r.dataset.event === ev) &&
        (!sc || r.dataset.school === sc) &&
        (!term || r.textContent.toLowerCase().includes(term));
      r.style.display = ok ? "" : "none";
    });
  }

  // ── Room inputs: one datalist per row ──────────────────────────────────────
  function attachRoomDatalistToRow(row) {
    const roomInput = row.querySelector(".room-input");
    if (!roomInput || roomInput.readOnly || roomInput.dataset.dlAttached)
      return;
    roomInput.dataset.dlAttached = "1";
    const eventName = row.dataset.event || "";
    const dlId = "rdl-" + Math.random().toString(36).slice(2, 9);
    const dl = document.createElement("datalist");
    dl.id = dlId;
    document.body.appendChild(dl);
    roomInput.setAttribute("list", dlId);
    function populate() {
      const rooms = getRoomsForEvent(eventName);
      dl.innerHTML = rooms
        .map(
          (r) =>
            `<option value="${escHtml(r.room_number)}">${escHtml(
              r.room_number
            )}</option>`
        )
        .join("");
      if (!rooms.length && eventName) {
        fetch(`/api/rooms-for-event/${encodeURIComponent(eventName)}`, {
          credentials: "include",
        })
          .then((r) => r.json())
          .then((list) => {
            dl.innerHTML = (list || [])
              .map((r) => `<option value="${escHtml(r.room_number)}">`)
              .join("");
            if (!list || !list.length)
              roomInput.placeholder = `No rooms for "${eventName}"`;
          })
          .catch(() => {});
      }
    }
    roomInput.addEventListener("focus", populate, { once: true });
    populate();
  }

  function initAllRoomInputs() {
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach((row) => attachRoomDatalistToRow(row));
  }

  // ── Assign button ─────────────────────────────────────────────────────────
  if (tbody) {
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-assign");
      if (!btn) return;
      const row = btn.closest("tr");
      const input = row.querySelector(".room-input");
      const name = btn.dataset.studentname;
      const event = row.dataset.event || "";

      if (btn.classList.contains("assigned")) {
        btn.classList.remove("assigned");
        btn.textContent = "Save";
        input.readOnly = false;
        attachRoomDatalistToRow(row);
        input.focus();
        return;
      }
      const room = (input.value || "").trim();
      if (!room) {
        showToast("Select or enter a room number.", "error");
        return;
      }

      // Validate room matches event
      const validRooms = getRoomsForEvent(event);
      if (validRooms.length > 0) {
        const match = validRooms.find(
          (r) => r.room_number.trim().toLowerCase() === room.toLowerCase()
        );
        if (!match) {
          showToast(`"${room}" is not a valid room for "${event}".`, "error");
          return;
        }
      }

      btn.disabled = true;
      btn.textContent = "Saving...";
      try {
        const data = await fetch("/api/assign-room", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: name,
            room,
            studentEvent: event,
          }),
        }).then((r) => r.json());
        if (data.success) {
          showToast("Room assigned!", "success");
          input.readOnly = true;
          btn.classList.add("assigned");
          btn.textContent = "Assigned";
          btn.title = "Click to edit";
        } else {
          showToast(data.message || "Failed.", "error");
          btn.textContent = "Assign";
        }
      } catch (_) {
        showToast("Connection error.", "error");
        btn.textContent = "Assign";
      } finally {
        btn.disabled = false;
      }
    });

    tbody.addEventListener("mouseover", (e) => {
      const btn = e.target.closest(".btn-assign");
      if (btn?.classList.contains("assigned")) btn.textContent = "Edit";
    });
    tbody.addEventListener("mouseout", (e) => {
      const btn = e.target.closest(".btn-assign");
      if (btn?.classList.contains("assigned")) btn.textContent = "Assigned";
    });
  }

  // ── Unique ID + Attendance Checkboxes ─────────────────────────────────────
  // Ported from reference admin.js with ISKCON-aware event prefixes
  // FIX: Generates PA01, DR01, SH01 etc. on checkbox check, saves to DB
  const eventCounters = {};

  // Event name → 2-letter prefix
  function getEventPrefix(eventName) {
    const manual = {
      Drawing: "DR",
      Shloka: "SH",
      "Fancy Dress": "FD",
      Quiz: "QU",
      Painting: "PA",
      Dance: "DN",
      Singing: "SG",
      Drama: "DM",
      Elocution: "EL",
      Rangoli: "RN",
      Craft: "CR",
      Storytelling: "ST",
      Bhajan: "BJ",
      "Classical Dance": "CD",
      "Folk Dance": "FK",
    };
    if (manual[eventName]) return manual[eventName];
    // Auto prefix: first 2 letters uppercase
    return (eventName || "XX")
      .replace(/[^A-Za-z]/g, "")
      .substring(0, 2)
      .toUpperCase();
  }

  // Initialize counters from existing unique_id values in the table
  if (tbody) {
    tbody.querySelectorAll("tr").forEach((row) => {
      const eventName = row.dataset.event || "";
      const idCell = row.querySelector(".unique-id-cell");
      if (!idCell || !idCell.textContent.trim()) return;
      const existingId = idCell.textContent.trim();
      const prefix = getEventPrefix(eventName);
      if (existingId.startsWith(prefix)) {
        const num = parseInt(existingId.substring(prefix.length), 10);
        if (
          !isNaN(num) &&
          (!eventCounters[eventName] || num > eventCounters[eventName])
        ) {
          eventCounters[eventName] = num;
        }
      }
    });
    console.log("[Admin] Event counters initialized:", eventCounters);
  }

  // Wire checkbox change events
  if (tbody) {
    const checkboxes = tbody.querySelectorAll(".student-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", async function () {
        const row = this.closest("tr");
        const idCell = row.querySelector(".unique-id-cell");
        const eventName = row.dataset.event || "";
        const studentName = this.dataset.studentName;
        const isSelected = this.checked ? 1 : 0;

        let uniqueId = null;

        if (this.checked) {
          // Generate next ID for this event
          if (!eventCounters[eventName]) eventCounters[eventName] = 0;
          eventCounters[eventName]++;
          const prefix = getEventPrefix(eventName);
          const idNumber = String(eventCounters[eventName]).padStart(2, "0");
          uniqueId = `${prefix}${idNumber}`;
          if (idCell) {
            idCell.textContent = uniqueId;
            row.dataset.uniqueId = uniqueId;
          }
        } else {
          // Uncheck: clear ID, decrement counter if needed
          if (idCell) {
            idCell.textContent = "";
            delete row.dataset.uniqueId;
          }
          // Note: we don't decrement counter to avoid ID collision
        }

        // Update attendance status label
        const statusEl = row.querySelector(".attendance-status");
        if (statusEl) {
          statusEl.textContent = this.checked ? "Present" : "—";
          statusEl.className = `attendance-status ${
            this.checked ? "att-present" : "att-absent"
          }`;
        }

        // Save to DB via update-student-id endpoint
        try {
          await fetch("/api/update-student-id", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentName, isSelected, uniqueId }),
          });
          updateAttendanceSummary();
        } catch (err) {
          showToast("Failed to save attendance.", "error");
          // Revert UI
          this.checked = !this.checked;
          if (idCell) idCell.textContent = uniqueId || "";
        }
      });
    });
  }

  function updateAttendanceSummary() {
    if (!tbody) return;
    const all = tbody.querySelectorAll(".student-checkbox");
    const present = tbody.querySelectorAll(".student-checkbox:checked");
    const el = document.getElementById("att-present-count");
    const el2 = document.getElementById("att-total-count");
    if (el) el.textContent = present.length;
    if (el2) el2.textContent = all.length;
  }
  updateAttendanceSummary();

  // ── Attendance dashboard ─────────────────────────────────────────────────
  let attFilterEvent = "",
    attFilterSchool = "";

  window.loadAttendanceDashboard = async function (filterEvent, filterSchool) {
    if (filterEvent !== undefined) attFilterEvent = filterEvent;
    if (filterSchool !== undefined) attFilterSchool = filterSchool;

    const summaryEl = document.getElementById("att-summary-section");
    const evTableEl = document.getElementById("att-event-table-body");
    const scTableEl = document.getElementById("att-school-table-body");

    // Show loading
    if (summaryEl)
      summaryEl.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:20px;color:#94a3b8;font-size:14px"><div class="spin-sm"></div>Loading attendance data...</div>`;
    if (evTableEl)
      evTableEl.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Loading...</td></tr>`;
    if (scTableEl)
      scTableEl.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Loading...</td></tr>`;

    try {
      let url = "/api/attendance-stats";
      const params = [];
      if (attFilterEvent)
        params.push(`event=${encodeURIComponent(attFilterEvent)}`);
      if (attFilterSchool)
        params.push(`school=${encodeURIComponent(attFilterSchool)}`);
      if (params.length) url += "?" + params.join("&");

      const data = await fetch(url, { credentials: "include" }).then((r) =>
        r.json()
      );
      if (data.error) throw new Error(data.error);

      const ov = data.overall || {};
      const pct = ov.total > 0 ? Math.round((ov.present / ov.total) * 100) : 0;

      // Build filter dropdowns once
      const filterSection = document.getElementById("att-filter-section");
      if (filterSection && !filterSection.dataset.built) {
        filterSection.dataset.built = "1";
        const evSel = document.getElementById("att-event-filter");
        const scSel = document.getElementById("att-school-filter");
        const evSet = new Set((data.byEvent || []).map((e) => e.event_name));
        const scSet = new Set((data.bySchool || []).map((s) => s.school_name));
        if (evSel) {
          evSet.forEach((e) => {
            if (![...evSel.options].find((o) => o.value === e))
              evSel.add(new Option(e, e));
          });
        }
        if (scSel) {
          scSet.forEach((s) => {
            if (![...scSel.options].find((o) => o.value === s))
              scSel.add(new Option(s, s));
          });
        }
      }

      // Summary cards
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="att-cards">
            <div class="att-card att-card-green"><span class="att-card-num">${
              ov.present || 0
            }</span><span class="att-card-lbl">Present</span></div>
            <div class="att-card att-card-red"><span class="att-card-num">${
              ov.absent || 0
            }</span><span class="att-card-lbl">Absent</span></div>
            <div class="att-card att-card-blue"><span class="att-card-num">${
              ov.total || 0
            }</span><span class="att-card-lbl">Registered</span></div>
            <div class="att-card att-card-purple"><span class="att-card-num">${pct}%</span><span class="att-card-lbl">Attendance Rate</span></div>
          </div>
          <div class="att-progress-wrap" style="margin-top:12px">
            <div class="att-progress-bar"><div class="att-progress-fill" style="width:${pct}%"></div></div>
            <span class="att-progress-label">${pct}% (${ov.present}/${
          ov.total
        })</span>
          </div>`;
      }

      // By event table
      if (evTableEl) {
        evTableEl.innerHTML =
          (data.byEvent || [])
            .map(
              (ev) => `
          <tr>
            <td><span class="event-badge">${escHtml(ev.event_name)}</span></td>
            <td>${ev.total}</td>
            <td style="color:#16a34a;font-weight:600">${ev.present}</td>
            <td style="color:#dc2626;font-weight:600">${ev.absent}</td>
            <td><strong>${ev.attendance_pct}%</strong></td>
            <td style="min-width:120px"><div class="mini-progress"><div class="mini-progress-fill" style="width:${
              ev.attendance_pct
            }%"></div></div></td>
          </tr>`
            )
            .join("") ||
          `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">No data</td></tr>`;
      }

      // By school table
      if (scTableEl) {
        scTableEl.innerHTML =
          (data.bySchool || [])
            .map(
              (sc, i) => `
          <tr>
            <td style="color:#94a3b8;font-size:12px">${i + 1}</td>
            <td><strong>${escHtml(sc.school_name)}</strong></td>
            <td>${sc.total}</td>
            <td style="color:#16a34a;font-weight:600">${sc.present}</td>
            <td style="color:#dc2626;font-weight:600">${sc.absent}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="mini-progress" style="flex:1"><div class="mini-progress-fill" style="width:${
                  sc.attendance_pct
                }%"></div></div>
                <strong style="font-size:12px;min-width:36px">${
                  sc.attendance_pct
                }%</strong>
              </div>
            </td>
          </tr>`
            )
            .join("") ||
          `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">No data</td></tr>`;
      }
    } catch (err) {
      console.error("[Attendance]", err);
      if (summaryEl)
        summaryEl.innerHTML = `<p style="color:#dc2626;padding:20px">Failed to load: ${err.message}</p>`;
    }
  };

  // Wire attendance filters
  document
    .getElementById("att-event-filter")
    ?.addEventListener("change", function () {
      window.loadAttendanceDashboard(this.value, attFilterSchool);
    });
  document
    .getElementById("att-school-filter")
    ?.addEventListener("change", function () {
      window.loadAttendanceDashboard(attFilterEvent, this.value);
    });
  document
    .getElementById("att-reset-filter")
    ?.addEventListener("click", function () {
      const evSel = document.getElementById("att-event-filter");
      const scSel = document.getElementById("att-school-filter");
      if (evSel) evSel.value = "";
      if (scSel) scSel.value = "";
      window.loadAttendanceDashboard("", "");
    });

  // Export absentees from student table
  window.exportAbsentees = function () {
    if (!tbody) {
      showToast("No student data.", "info");
      return;
    }
    const rows = Array.from(tbody.querySelectorAll("tr")).filter((r) => {
      const cb = r.querySelector(".student-checkbox");
      return cb && !cb.checked && r.style.display !== "none";
    });
    if (!rows.length) {
      showToast("No absentees in current view.", "info");
      return;
    }
    const csv = ["Name,Event,School,Room,Unique ID"];
    rows.forEach((r) => {
      const cells = r.querySelectorAll("td");
      const name = cells[6]?.querySelector("strong")?.textContent.trim() || "";
      const event = cells[3]?.textContent.trim() || "";
      const school = cells[1]?.textContent.trim() || "";
      const room = cells[7]?.querySelector("input")?.value || "";
      const uid = cells[9]?.textContent.trim() || ""; // unique-id-cell if present
      csv.push(`"${name}","${event}","${school}","${room}","${uid}"`);
    });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(
        new Blob([csv.join("\n")], { type: "text/csv" })
      ),
      download: "absentees.csv",
    });
    a.click();
  };

  // ── Create Room ──────────────────────────────────────────────────────────
  document
    .getElementById("createRoomForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rn = document.getElementById("roomNumber")?.value.trim();
      const en = document.getElementById("eventName")?.value.trim();
      const btn = e.target.querySelector("button[type=submit]");
      if (!rn || !en) {
        showToast("Fill all fields.", "error");
        return;
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Creating...";
      }
      try {
        const data = await fetch("/rooms/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomNumber: rn, eventName: en }),
        }).then((r) => r.json());
        if (data.success) {
          showToast(`Room "${rn}" created!`, "success");
          e.target.reset();
          await loadRoomsCache();
          window.fetchDashboard?.();
        } else showToast(data.error || "Failed.", "error");
      } catch {
        showToast("Server error.", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Create Room";
        }
      }
    });

  // ── Assign Judge ────────────────────────────────────────────────────────
  const assignForm = document.getElementById("assignRoomForm");
  let assignInFlight = false;
  if (assignForm) {
    assignForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (assignInFlight) return;
      const jn = document.getElementById("judgeName")?.value.trim();
      const je = document.getElementById("judgeEmail")?.value.trim();
      const rn = document.getElementById("roomNo")?.value.trim();
      const btn = assignForm.querySelector("button[type=submit]");
      if (!jn || !je || !rn) {
        showToast("Fill all fields.", "error");
        return;
      }
      assignInFlight = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Assigning...";
      }
      try {
        const data = await fetch("/assign", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            judgeName: jn,
            judgeEmail: je,
            roomNumber: rn,
          }),
        }).then((r) => r.json());
        if (data.success) {
          showToast(data.message || "Judge assigned!", "success");
          const cc = document.getElementById("credentials-card");
          if (cc && data.credentials) {
            document.getElementById("cred-username").textContent =
              data.credentials.username;
            document.getElementById("cred-password").textContent =
              data.credentials.password || "(existing — unchanged)";
            cc.style.display = "block";
          }
          assignForm.reset();
          window.fetchDashboard?.();
        } else showToast(data.error || "Failed.", "error");
      } catch {
        showToast("Server error.", "error");
      } finally {
        assignInFlight = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Assign Judge";
        }
      }
    });
  }

  // ── CSV Upload ──────────────────────────────────────────────────────────
  const uploadZone = document.getElementById("uploadZone");
  const csvInput = document.getElementById("csvFileInput");
  const fileSelected = document.getElementById("fileSelected");
  const fileSelName = document.getElementById("fileSelectedName");
  const removeFileBtn = document.getElementById("removeFile");
  const uploadBtn = document.getElementById("uploadBtn");
  const uploadProgress = document.getElementById("uploadProgress");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const uploadResult = document.getElementById("uploadResult");
  let selectedFile = null;

  function setFile(f) {
    if (!f || !f.name.toLowerCase().endsWith(".csv")) {
      showToast("Only .csv files.", "error");
      return;
    }
    selectedFile = f;
    if (fileSelName)
      fileSelName.textContent = `${f.name} (${(f.size / 1024).toFixed(1)} KB)`;
    if (fileSelected) fileSelected.style.display = "flex";
    if (uploadBtn) uploadBtn.disabled = false;
    if (uploadResult) uploadResult.style.display = "none";
  }
  function clearFile() {
    selectedFile = null;
    if (fileSelected) fileSelected.style.display = "none";
    if (uploadBtn) uploadBtn.disabled = true;
    if (csvInput) csvInput.value = "";
  }

  csvInput?.addEventListener("change", () => setFile(csvInput.files[0]));
  removeFileBtn?.addEventListener("click", clearFile);
  if (uploadZone) {
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("drag-over");
    });
    uploadZone.addEventListener("dragleave", () =>
      uploadZone.classList.remove("drag-over")
    );
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("drag-over");
      setFile(e.dataTransfer.files[0]);
    });
    uploadZone.addEventListener("click", (e) => {
      if (!e.target.classList.contains("btn-choose")) csvInput?.click();
    });
  }
  uploadBtn?.addEventListener("click", async () => {
    if (!selectedFile) return;
    uploadBtn.disabled = true;
    if (uploadProgress) uploadProgress.style.display = "block";
    if (uploadResult) uploadResult.style.display = "none";
    let prog = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + Math.random() * 12, 85);
      if (progressFill) progressFill.style.width = prog + "%";
    }, 200);
    try {
      const fd = new FormData();
      fd.append("csvFile", selectedFile);
      const data = await fetch("/admin/upload-csv", {
        method: "POST",
        credentials: "include",
        body: fd,
      }).then((r) => r.json());
      clearInterval(iv);
      if (progressFill) progressFill.style.width = "100%";
      if (progressText) progressText.textContent = "Done!";
      if (uploadResult) {
        uploadResult.className = `upload-result ${
          data.success ? "success" : "error"
        }`;
        uploadResult.textContent = data.message;
        uploadResult.style.display = "block";
      }
      showToast(data.message, data.success ? "success" : "error");
      if (data.success) clearFile();
    } catch {
      clearInterval(iv);
      showToast("Upload failed.", "error");
    } finally {
      uploadBtn.disabled = false;
      setTimeout(() => {
        if (uploadProgress) uploadProgress.style.display = "none";
      }, 2500);
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  loadRoomsCache().then(initAllRoomInputs);
  setInterval(() => loadRoomsCache().then(initAllRoomInputs), 30000);
});
