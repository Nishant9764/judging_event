// public/js/judge.js
const dashboardView = document.getElementById("dashboard-view");
const scoringView = document.getElementById("scoring-view");
const scoringEventTitle = document.getElementById("scoring-event-title");
const scoringEventSubtitle = document.getElementById("scoring-event-subtitle");
const studentListUl = document.getElementById("student-list-ul");
const studentListHeader = document.getElementById("student-list-header");
const studentProgressBar = document.getElementById("student-progress-bar");
const studentProgressText = document.getElementById("student-progress-text");
const scoringPanel = document.getElementById("scoring-panel");

let currentEvent = null; // { id, title, roomNumber, parameters:[], students:[] }
let currentStudent = null; // reference to object inside currentEvent.students
let livePollingInterval = null;

/* ---------- Helpers ---------- */

function genStudentId(s, idx) {
  // stable unique id fallback: use unique_id if present otherwise fall back to index-based synthetic id
  return s.unique_id || s.id || s.uniqueId || `__stu_idx_${idx}`;
}

async function safeFetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    console.error(
      "Fetch error:",
      res.status,
      res.statusText,
      text.slice(0, 600)
    );
    throw new Error("HTTP error " + res.status);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("Invalid JSON response", text.slice(0, 600));
    throw err;
  }
}

/* ---------- Start Scoring & Polling ---------- */

async function startScoringByEvent(eventId, eventName, roomNumber) {
  try {
    // fetch parameters
    const params = await safeFetchJson(
      `/api/parameters/${encodeURIComponent(eventName)}`
    );

    // fetch students by room+event if roomNumber provided, fallback to event-only
    let students = [];
    if (roomNumber) {
      students = await safeFetchJson(
        `/api/students-by-room-event/${encodeURIComponent(
          roomNumber
        )}/${encodeURIComponent(eventName)}`
      );
    } else {
      students = await safeFetchJson(
        `/api/students/${encodeURIComponent(eventName)}`
      );
    }

    // normalize students and ensure stable unique ids
    const normalized = (students || []).map((s, idx) => ({
      unique_id: genStudentId(s, idx),
      name: s.name || s.NAME || s.student_name || "Unknown",
      scored: !!(s.scored || false),
      scores: s.scores || {},
      comments: s.comments || "",
    }));

    currentEvent = {
      id: eventId,
      title: eventName,
      roomNumber: roomNumber || null,
      parameters: (params || []).map((p) => ({
        parameter_id: p.parameter_id,
        parameter_name: p.parameter_name,
        max_score: Number(p.max_score || 10),
      })),
      students: normalized,
    };

    // show scoring UI
    scoringEventTitle.textContent = currentEvent.title;
    scoringEventSubtitle.textContent = `Students: ${currentEvent.students.length}`;
    dashboardView.classList.add("hidden");
    scoringView.classList.remove("hidden");

    populateStudentList();

    const firstUnscored = currentEvent.students.find((s) => !s.scored);
    const toOpen = firstUnscored
      ? firstUnscored.unique_id
      : currentEvent.students[0] && currentEvent.students[0].unique_id;
    if (toOpen) renderScoringPanel(toOpen);
    else
      scoringPanel.innerHTML = `<div class="text-center p-12 text-gray-500"><p>No students assigned to this room/event yet.</p></div>`;

    // start live polling every 3 seconds (restart interval cleanly)
    if (livePollingInterval) clearInterval(livePollingInterval);
    livePollingInterval = setInterval(pollStudentsAndParameters, 3000);
  } catch (err) {
    console.error("startScoringByEvent failed:", err);
    alert("Failed to load event data — check console.");
  }
}

async function pollStudentsAndParameters() {
  if (!currentEvent) return;
  try {
    // students: prefer room+event endpoint for exact validation
    let studentsRaw = [];
    if (currentEvent.roomNumber) {
      studentsRaw = await safeFetchJson(
        `/api/students-by-room-event/${encodeURIComponent(
          currentEvent.roomNumber
        )}/${encodeURIComponent(currentEvent.title)}`
      );
    } else {
      studentsRaw = await safeFetchJson(
        `/api/students/${encodeURIComponent(currentEvent.title)}`
      );
    }

    // normalize but preserve scored/scores/comments for existing students by unique_id
    const normalized = (studentsRaw || []).map((s, idx) => {
      const uid = genStudentId(s, idx);
      const existing = (currentEvent.students || []).find(
        (x) => x.unique_id === uid
      );
      return {
        unique_id: uid,
        name: s.name || s.NAME || s.student_name || existing?.name || "Unknown",
        scored: existing?.scored || false,
        scores: existing?.scores ? { ...existing.scores } : {},
        comments: existing?.comments || "",
      };
    });

    currentEvent.students = normalized;
    populateStudentList();

    // parameters: refresh (admin might add a parameter)
    const paramsRaw = await safeFetchJson(
      `/api/parameters/${encodeURIComponent(currentEvent.title)}`
    );
    const normalizedParams = (paramsRaw || []).map((p) => ({
      parameter_id: p.parameter_id,
      parameter_name: p.parameter_name,
      max_score: Number(p.max_score || 10),
    }));

    // update only if changed (simple stringify check)
    if (
      JSON.stringify(normalizedParams) !==
      JSON.stringify(currentEvent.parameters || [])
    ) {
      currentEvent.parameters = normalizedParams;
    }

    // re-render current student's panel to reflect any parameter or student changes
    if (currentStudent && currentStudent.unique_id) {
      const stillExists = currentEvent.students.find(
        (s) => s.unique_id === currentStudent.unique_id
      );
      if (stillExists) {
        renderScoringPanel(currentStudent.unique_id);
      } else {
        // current student removed — open first available
        const first = currentEvent.students[0];
        if (first) renderScoringPanel(first.unique_id);
        else
          scoringPanel.innerHTML = `<div class="text-center p-12 text-gray-500"><p>No students assigned.</p></div>`;
      }
    }
  } catch (err) {
    // don't blow up polling if a single request fails
    console.warn("pollStudentsAndParameters failed:", err?.message || err);
  }
}

/* ---------- Render Sidebar ---------- */

function populateStudentList() {
  studentListUl.innerHTML = "";
  if (!currentEvent) return;
  const students = currentEvent.students || [];
  studentListHeader.textContent = `Students (${students.length})`;

  students.forEach((s) => {
    const li = document.createElement("li");

    // button container
    const btn = document.createElement("button");
    btn.className =
      "w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors";
    btn.dataset.studentId = s.unique_id;

    const left = document.createElement("span");
    left.className = "flex items-center gap-3";
    left.innerHTML = `<i data-feather="user" class="w-5 h-5 text-gray-500"></i><span class="font-medium">${s.name}</span>`;

    const right = document.createElement("span");
    right.innerHTML = s.scored
      ? '<i data-feather="check-circle" class="w-5 h-5 text-green-500"></i>'
      : "";

    btn.appendChild(left);
    btn.appendChild(right);

    btn.addEventListener("click", () => {
      // render the panel for this studentId (always lookup latest object by id)
      renderScoringPanel(btn.dataset.studentId);
    });

    li.appendChild(btn);
    studentListUl.appendChild(li);
  });

  updateStudentProgress();
  feather.replace();
}

/* ---------- Render Scoring Panel (DOM-based, safe listeners) ---------- */

function renderScoringPanel(studentUniqueId) {
  if (!currentEvent) return;
  const student = currentEvent.students.find(
    (s) => s.unique_id === studentUniqueId
  );
  if (!student) return;

  // set current student reference to object in the students array
  currentStudent = student;

  // Clear scoringPanel and build elements (avoid innerHTML string)
  scoringPanel.innerHTML = "";

  // Header block (title + total)
  const header = document.createElement("div");
  header.className = "flex justify-between items-start mb-6";

  const left = document.createElement("div");
  left.innerHTML = `<h3 class="text-xl font-bold">Scoring: ${student.name}</h3>`;
  header.appendChild(left);

  const right = document.createElement("div");
  right.className = "text-right";
  const totalScoreEl = document.createElement("p");
  totalScoreEl.id = "total-score";
  totalScoreEl.className = "text-3xl font-bold";
  // calculate initial total
  const initialTotal = currentEvent.parameters.reduce(
    (acc, p) => acc + Number(student.scores?.[p.parameter_id] || 0),
    0
  );
  totalScoreEl.textContent = String(initialTotal);
  right.appendChild(totalScoreEl);
  const totalLabel = document.createElement("p");
  totalLabel.className = "text-gray-500";
  totalLabel.textContent = "Total Score";
  right.appendChild(totalLabel);

  header.appendChild(right);
  scoringPanel.appendChild(header);

  // Parameters container
  const paramsContainer = document.createElement("div");
  paramsContainer.className = "space-y-6";

  currentEvent.parameters.forEach((p) => {
    const paramRow = document.createElement("div");

    // label row
    const labelRow = document.createElement("div");
    labelRow.className = "flex justify-between items-center mb-2";

    const label = document.createElement("label");
    label.className = "font-semibold";
    label.textContent = p.parameter_name;

    const valueSpan = document.createElement("span");
    valueSpan.className = "font-bold";
    const valueNum = document.createElement("span");
    // unique display id to avoid collisions
    const displayId = `param-${student.unique_id}-${p.parameter_id}-value`;
    valueNum.id = displayId;
    const existing = Number(student.scores?.[p.parameter_id] || 0);
    valueNum.textContent = String(existing);
    valueSpan.appendChild(valueNum);
    valueSpan.insertAdjacentHTML("beforeend", ` / ${p.max_score}`);

    labelRow.appendChild(label);
    labelRow.appendChild(valueSpan);

    // input range
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(p.max_score);
    input.value = String(existing);
    input.step = "1";
    input.className =
      "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer param-range";
    // store parameter id and student id on element
    input.dataset.parameterId = String(p.parameter_id);
    input.dataset.studentId = student.unique_id;

    // input event: write to student's scores and update total display
    input.addEventListener("input", (e) => {
      const pid = e.target.dataset.parameterId;
      const sid = e.target.dataset.studentId;
      const val = Number(e.target.value);

      // find student object (fresh) by sid
      const st = currentEvent.students.find((x) => x.unique_id === sid);
      if (!st) return;
      if (!st.scores) st.scores = {};
      st.scores[pid] = val;

      // update display
      const disp = document.getElementById(`param-${sid}-${pid}-value`);
      if (disp) disp.textContent = String(val);

      // recompute total
      const total = currentEvent.parameters.reduce(
        (acc, pr) => acc + Number(st.scores?.[pr.parameter_id] || 0),
        0
      );
      const totalEl = document.getElementById("total-score");
      if (totalEl) totalEl.textContent = String(total);
    });

    paramRow.appendChild(labelRow);
    paramRow.appendChild(input);
    paramsContainer.appendChild(paramRow);
  });

  scoringPanel.appendChild(paramsContainer);

  // Comments box
  const commentsDiv = document.createElement("div");
  commentsDiv.className = "mt-8";
  const commentsLabel = document.createElement("label");
  commentsLabel.className = "font-semibold";
  commentsLabel.htmlFor = `comments-${student.unique_id}`;
  commentsLabel.textContent = "Additional Comments (Optional)";
  const commentsTextarea = document.createElement("textarea");
  commentsTextarea.id = `comments-${student.unique_id}`;
  commentsTextarea.rows = 4;
  commentsTextarea.className =
    "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg";
  commentsTextarea.value = student.comments || "";
  commentsTextarea.addEventListener("input", (e) => {
    // update student comment on input
    const st = currentEvent.students.find(
      (x) => x.unique_id === student.unique_id
    );
    if (!st) return;
    st.comments = e.target.value;
  });
  commentsDiv.appendChild(commentsLabel);
  commentsDiv.appendChild(document.createElement("br"));
  commentsDiv.appendChild(commentsTextarea);
  scoringPanel.appendChild(commentsDiv);

  // Footer actions (skip + submit)
  const footer = document.createElement("div");
  footer.className =
    "mt-8 pt-6 border-t border-gray-200 flex items-center justify-end gap-4";

  const skipBtn = document.createElement("button");
  skipBtn.id = "skip-button";
  skipBtn.className =
    "font-semibold text-gray-600 hover:text-gray-900 transition-colors";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", () => {
    // find index of current student and navigate to next
    const idx = currentEvent.students.findIndex(
      (x) => x.unique_id === student.unique_id
    );
    const next = currentEvent.students[idx + 1];
    if (next) renderScoringPanel(next.unique_id);
    else showDashboard();
  });

  const submitBtn = document.createElement("button");
  submitBtn.id = "submit-button";
  submitBtn.className =
    "bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2";
  submitBtn.innerHTML = `<i data-feather="check" class="w-5 h-5"></i><span>Submit Score</span>`;
  submitBtn.addEventListener("click", () => {
    // mark scored and move next (you can replace this with POST to persist)
    const st = currentEvent.students.find(
      (x) => x.unique_id === student.unique_id
    );
    if (!st) return;
    st.scored = true;

    // update UI list
    populateStudentList();

    // move to next student
    const idx = currentEvent.students.findIndex(
      (x) => x.unique_id === student.unique_id
    );
    const next = currentEvent.students[idx + 1];
    if (next) renderScoringPanel(next.unique_id);
    else {
      alert("Completed scoring for this room.");
      showDashboard();
    }
  });

  footer.appendChild(skipBtn);
  footer.appendChild(submitBtn);
  scoringPanel.appendChild(footer);

  // highlight active student in sidebar
  updateStudentListActiveState();
  feather.replace();
}

/* ---------- Utility UI helpers ---------- */

function updateStudentListActiveState() {
  studentListUl.querySelectorAll("button").forEach((btn) => {
    btn.classList.remove("bg-gray-200");
    if (currentStudent && btn.dataset.studentId === currentStudent.unique_id) {
      btn.classList.add("bg-gray-200");
    }
  });
}

function updateStudentProgress() {
  if (!currentEvent) return;
  const total = currentEvent.students.length;
  const scored = currentEvent.students.filter((s) => s.scored).length;
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  studentProgressBar.style.width = `${pct}%`;
  studentProgressText.textContent = `${pct}% complete`;
  studentListHeader.textContent = `Students (${total})`;
}

function showDashboard() {
  dashboardView.classList.remove("hidden");
  scoringView.classList.add("hidden");
  currentEvent = null;
  currentStudent = null;
  if (livePollingInterval) {
    clearInterval(livePollingInterval);
    livePollingInterval = null;
  }
}

/* ---------- Wire up dashboard buttons + stats poll ---------- */

document.addEventListener("DOMContentLoaded", () => {
  feather.replace();

  document
    .querySelectorAll("#dashboard-view [data-event-id]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const eventId = btn.dataset.eventId;
        const eventName = btn.dataset.eventName;
        const roomNumber = btn.dataset.roomNumber || btn.dataset.room || null;
        startScoringByEvent(eventId, eventName, roomNumber);
      });
    });

  // poll stats every 5 seconds (unchanged)
  setInterval(async () => {
    try {
      const res = await fetch("/judge/stats");
      if (!res.ok) return;
      const stats = await res.json();
      document.getElementById("total-students").textContent =
        stats.totalStudents ?? 0;
      document.getElementById("students-scored").textContent =
        stats.studentsScored ?? 0;
      document.getElementById("completed").textContent =
        stats.completedEvents ?? 0;
    } catch (err) {
      // silent
    }
  }, 3000);
});
