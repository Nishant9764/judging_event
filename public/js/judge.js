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

let currentEvent = null;
let currentStudent = null;
let livePollingInterval = null;

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

// Start scoring for selected event and room
async function startScoringByEvent(eventId, eventName, roomNumber) {
  try {
    // fetch parameters
    const params = await safeFetchJson(
      `/api/parameters/${encodeURIComponent(eventName)}`
    );

    // fetch students by room + event
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

    // normalize students
    const normalized = (students || []).map((s) => ({
      unique_id: s.unique_id || s.id || s.uniqueId,
      name: s.name || s.NAME || s.student_name || "Unknown",
      scored: false,
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

    // show scoring UI
    scoringEventTitle.textContent = currentEvent.title;
    scoringEventSubtitle.textContent = `Students: ${currentEvent.students.length}`;
    dashboardView.classList.add("hidden");
    scoringView.classList.remove("hidden");

    populateStudentList();
    const firstUnscored = currentEvent.students.find((s) => !s.scored);
    if (firstUnscored) renderScoringPanel(firstUnscored.unique_id);
    else if (currentEvent.students.length)
      renderScoringPanel(currentEvent.students[0].unique_id);
    else
      scoringPanel.innerHTML = `<div class="text-center p-12 text-gray-500"><p>No students assigned to this room/event yet.</p></div>`;

    // start live polling
    if (livePollingInterval) clearInterval(livePollingInterval);
    livePollingInterval = setInterval(pollStudentsAndParameters, 3000);
  } catch (err) {
    console.error("startScoringByEvent failed:", err);
    alert("Failed to load event data — check console.");
  }
}

// Live polling function
async function pollStudentsAndParameters() {
  if (!currentEvent) return;
  try {
    // refresh students with room + event validation
    let students = [];
    if (currentEvent.roomNumber) {
      students = await safeFetchJson(
        `/api/students-by-room-event/${encodeURIComponent(
          currentEvent.roomNumber
        )}/${encodeURIComponent(currentEvent.title)}`
      );
    } else {
      students = await safeFetchJson(
        `/api/students/${encodeURIComponent(currentEvent.title)}`
      );
    }

    const normalized = (students || []).map((s) => {
      const existing = currentEvent.students.find(
        (st) => st.unique_id === s.unique_id
      );
      return {
        unique_id: s.unique_id || s.id || s.uniqueId,
        name: s.name || s.NAME || s.student_name || "Unknown",
        scored: existing?.scored || false,
        scores: existing?.scores || {},
        comments: existing?.comments || "",
      };
    });

    currentEvent.students = normalized;
    populateStudentList();

    // refresh parameters
    const params = await safeFetchJson(
      `/api/parameters/${encodeURIComponent(currentEvent.title)}`
    );
    currentEvent.parameters = (params || []).map((p) => ({
      parameter_id: p.parameter_id,
      parameter_name: p.parameter_name,
      max_score: Number(p.max_score || 10),
    }));

    // re-render panel if needed
    if (currentStudent) renderScoringPanel(currentStudent.unique_id);
  } catch (err) {
    console.warn("Live poll failed", err.message);
  }
}

// Populate student list sidebar
function populateStudentList() {
  studentListUl.innerHTML = "";
  if (!currentEvent) return;
  const students = currentEvent.students || [];
  studentListHeader.textContent = `Students (${students.length})`;

  students.forEach((s) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className =
      "w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors";
    btn.dataset.studentId = s.unique_id; // capture studentId properly
    btn.innerHTML =
      `<span class="flex items-center gap-3"><i data-feather="user" class="w-5 h-5 text-gray-500"></i><span class="font-medium">${s.name}</span></span>` +
      (s.scored
        ? '<i data-feather="check-circle" class="w-5 h-5 text-green-500"></i>'
        : "");

    // Correct binding using dataset
    btn.addEventListener("click", (e) => {
      const sid = e.currentTarget.dataset.studentId;
      renderScoringPanel(sid);
    });

    li.appendChild(btn);
    studentListUl.appendChild(li);
  });

  updateStudentProgress();
  feather.replace();
}

// Render scoring panel
function renderScoringPanel(studentUniqueId) {
  const student = currentEvent.students.find(
    (x) => x.unique_id === studentUniqueId
  );
  if (!student) return;
  currentStudent = student;

  let totalInitial = 0;
  const paramHtml = currentEvent.parameters
    .map((p) => {
      const pid = p.parameter_id;
      const existing = Number(student.scores?.[pid] || 0);
      totalInitial += existing;
      return `
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="font-semibold">${p.parameter_name}</label>
          <span class="font-bold"><span id="param-${pid}-value">${existing}</span> / ${p.max_score}</span>
        </div>
        <input type="range" data-parameter-id="${pid}" min="0" max="${p.max_score}" value="${existing}" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer param-range">
      </div>`;
    })
    .join("\n");

  scoringPanel.innerHTML = `
    <div class="flex justify-between items-start mb-6">
      <div>
        <h3 class="text-xl font-bold">Scoring: ${student.name}</h3>
      </div>
      <div class="text-right">
        <p id="total-score" class="text-3xl font-bold">${totalInitial}</p>
        <p class="text-gray-500">Total Score</p>
      </div>
    </div>

    <div class="space-y-6">${paramHtml}</div>

    <div class="mt-8">
      <label for="comments" class="font-semibold">Additional Comments (Optional)</label>
      <textarea id="comments" rows="4" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg">${
        student.comments || ""
      }</textarea>
    </div>

    <div class="mt-8 pt-6 border-t border-gray-200 flex items-center justify-end gap-4">
      <button id="skip-button" class="font-semibold text-gray-600 hover:text-gray-900 transition-colors">Skip</button>
      <button id="submit-button" class="bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2">
        <i data-feather="check" class="w-5 h-5"></i>
        Submit Score
      </button>
    </div>
  `;

  scoringPanel.querySelectorAll(".param-range").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const pid = e.target.dataset.parameterId;
      const val = Number(e.target.value);
      const disp = document.getElementById(`param-${pid}-value`);
      if (disp) disp.textContent = val;
      if (!currentStudent.scores) currentStudent.scores = {};
      currentStudent.scores[pid] = val;

      const total = currentEvent.parameters.reduce(
        (acc, p) => acc + Number(currentStudent.scores[p.parameter_id] || 0),
        0
      );
      const totalEl = document.getElementById("total-score");
      if (totalEl) totalEl.textContent = total;
    });
  });

  scoringPanel
    .querySelector("#submit-button")
    .addEventListener("click", handleSubmitScore);
  scoringPanel
    .querySelector("#skip-button")
    .addEventListener("click", handleSkipStudent);
  scoringPanel
    .querySelector("#comments")
    .addEventListener(
      "input",
      (e) => (currentStudent.comments = e.target.value)
    );

  updateStudentListActiveState();
  feather.replace();
}

// Update sidebar active state
function updateStudentListActiveState() {
  studentListUl.querySelectorAll("button").forEach((btn) => {
    btn.classList.remove("bg-gray-200");
    if (currentStudent && btn.dataset.studentId === currentStudent.unique_id) {
      btn.classList.add("bg-gray-200");
    }
  });
}

// Update progress bar
function updateStudentProgress() {
  if (!currentEvent) return;
  const total = currentEvent.students.length;
  const scored = currentEvent.students.filter((s) => s.scored).length;
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  studentProgressBar.style.width = `${pct}%`;
  studentProgressText.textContent = `${pct}% complete`;
  studentListHeader.textContent = `Students (${total})`;
}

// Skip student
function handleSkipStudent() {
  const idx = currentEvent.students.findIndex(
    (s) => s.unique_id === currentStudent.unique_id
  );
  const next = currentEvent.students[idx + 1];
  if (next) renderScoringPanel(next.unique_id);
  else showDashboard();
}

// Submit score locally (we'll wire POST later)
function handleSubmitScore() {
  if (!currentStudent) return;
  currentStudent.scored = true;
  updateStudentProgress();
  populateStudentList();

  const idx = currentEvent.students.findIndex(
    (s) => s.unique_id === currentStudent.unique_id
  );
  const next = currentEvent.students[idx + 1];
  if (next) renderScoringPanel(next.unique_id);
  else {
    alert("Completed scoring for this room.");
    showDashboard();
  }
}

function showDashboard() {
  dashboardView.classList.remove("hidden");
  scoringView.classList.add("hidden");
  currentEvent = null;
  currentStudent = null;
  if (livePollingInterval) clearInterval(livePollingInterval);
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  feather.replace();

  document
    .querySelectorAll("#dashboard-view [data-event-id]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const eventId = btn.dataset.eventId;
        const eventName = btn.dataset.eventName;
        const roomNumber = btn.dataset.roomNumber || btn.dataset.room; // try both attributes
        startScoringByEvent(eventId, eventName, roomNumber);
      });
    });

  // poll stats every 5 seconds
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
