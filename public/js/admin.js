document.addEventListener("DOMContentLoaded", function () {
  // --- A: DEFINE ALL YOUR VARIABLES & ELEMENTS HERE ---
  const navLinks = document.querySelectorAll(".nav-link");
  const views = document.querySelectorAll(".view");
  const modal = document.getElementById("formModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalFormFields = document.getElementById("modalFormFields");
  const closeModalBtn = document.querySelector(".close-btn");
  const addEventBtn = document.getElementById("addEventBtn");
  const addJudgeBtn = document.getElementById("addJudgeBtn");
  const createRoomForm = document.getElementById("createRoomForm");
  const assignRoomForm = document.getElementById("assignRoomForm");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentTableBody = document.getElementById("studentTableBody");
  const credentialsOutput = document.getElementById("credentialsOutput");
  const eventCounters = {};
  const eventPrefixes = {
    Drawing: "DR",
    Shloka: "SH",
    "Fancy Dress": "FD",
    Quiz: "QU",
  };
  let isSubmitting = false;

  // Initialize counters from existing data to prevent duplicates on reload
  document.querySelectorAll("#studentTableBody tr").forEach((row) => {
    const eventName = row.dataset.event;
    const idCell = row.querySelector(".unique-id-cell");

    if (idCell && idCell.textContent.trim()) {
      const existingId = idCell.textContent.trim();
      const prefix =
        eventPrefixes[eventName] || eventName.substring(0, 2).toUpperCase();

      if (existingId.startsWith(prefix)) {
        const number = parseInt(existingId.substring(prefix.length), 10);
        if (
          !isNaN(number) &&
          (!eventCounters[eventName] || number > eventCounters[eventName])
        ) {
          eventCounters[eventName] = number;
        }
      }
    }
  });
  console.log("Counters initialized from existing data:", eventCounters);

  // --- B: DEFINE ALL YOUR HELPER FUNCTIONS HERE ---

  // Creates the notification container if it doesn't exist
  function createNotifContainer() {
    let container = document.createElement("div");
    container.id = "notification-container";
    container.className = "notification-container";
    document.body.appendChild(container);
    return container;
  }

  // Shows a notification message
  function showNotification(message, type = "success", duration = 4000) {
    if (!message) return;
    const container =
      document.getElementById("notification-container") ||
      createNotifContainer();
    const notif = document.createElement("div");
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => notif.classList.add("show"), 10);
    setTimeout(() => {
      notif.classList.remove("show");
      setTimeout(() => notif.remove(), 500);
    }, duration);
  }

  // Shows the judge credentials card
  function showCredentials(username, password) {
    if (!credentialsOutput) return;
    credentialsOutput.style.display = "block";
    credentialsOutput.innerHTML = `
      <div class="credentials-card">
        <h4>Judge Credentials</h4>
        <p><b>Username:</b> ${username}</p>
        <p><b>Password:</b> ${password}</p>
      </div>
    `;
  }

  // Opens the modal with dynamic content
  function openModal(title, formFieldsHTML) {
    if (!modal) return;
    modalTitle.textContent = title;
    modalFormFields.innerHTML = formFieldsHTML;
    modal.style.display = "block";
  }

  // Closes the modal
  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
  }

  // Updates a student's selection status and unique ID in the database
  async function updateStudentStatus(name, status, uniqueId) {
    console.log(
      `Sending to server: Name=${name}, Status=${status}, ID=${uniqueId}`
    );
    try {
      const response = await fetch("/admin/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: name,
          isSelected: status,
          uniqueId: uniqueId,
        }),
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const result = await response.json();
      console.log("Database updated successfully:", result);
    } catch (error) {
      console.error("Error updating student status:", error);
      showNotification("Could not save student status.", "error");
    }
  }

  // Assigns a room to a student in the database
  async function assignRoomToStudent(name, room, button, input) {
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const response = await fetch("/api/assign-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: name,
          room: room,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update.");
      }

      // SUCCESS: Update the UI to the "Assigned" state
      showNotification(
        result.message || "Room assigned successfully!",
        "success"
      );
      input.readOnly = true;
      button.classList.add("assigned");
      button.textContent = "Assigned";
    } catch (error) {
      showNotification(error.message, "error");
      // On error, revert button text if it wasn't already assigned
      if (!button.classList.contains("assigned")) {
        button.textContent = "Assign";
      }
    } finally {
      button.disabled = false;
    }
  }

  // --- C: ADD ALL YOUR EVENT LISTENERS HERE ---

  // View Switching Logic
  navLinks.forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      const viewToShow = this.getAttribute("data-view");

      navLinks.forEach((nav) => nav.classList.remove("active"));
      this.classList.add("active");

      views.forEach((view) => {
        if (view.id === viewToShow) {
          view.classList.add("active");
        } else {
          view.classList.remove("active");
        }
      });
    });
  });

  // Student Search/Filter Logic
  if (studentSearchInput) {
    studentSearchInput.addEventListener("keyup", (event) => {
      const searchTerm = event.target.value.toLowerCase();
      const studentTableRows = document.querySelectorAll(
        "#studentTableBody tr"
      );
      studentTableRows.forEach((row) => {
        const rowText = row.textContent.toLowerCase();
        row.style.display = rowText.includes(searchTerm) ? "" : "none";
      });
    });
  }

  // Event delegation for the student table (Room Assignment and Checkboxes)
  if (studentTableBody) {
    // Main click handler for "Assign/Save" buttons
    studentTableBody.addEventListener("click", async (event) => {
      if (event.target.classList.contains("btn-assign")) {
        const button = event.target;
        const row = button.closest("tr");
        const input = row.querySelector(".room-input");
        const studentName = button.dataset.studentname;

        // If button is in "Assigned" state, switch to "Edit" mode
        if (button.classList.contains("assigned")) {
          button.classList.remove("assigned");
          button.textContent = "Save";
          input.readOnly = false;
          input.focus();
          return;
        }

        // If button is in "Assign" or "Save" state, save the data
        const roomNumber = input.value.trim();
        if (!roomNumber) {
          showNotification("Please enter a room number.", "error");
          return;
        }
        await assignRoomToStudent(studentName, roomNumber, button, input);
      }
    });

    // Hover-effect listeners to show "Edit" text on assigned buttons
    studentTableBody.addEventListener("mouseover", (event) => {
      const button = event.target;
      if (
        button.classList.contains("btn-assign") &&
        button.classList.contains("assigned")
      ) {
        button.textContent = "Edit";
      }
    });

    studentTableBody.addEventListener("mouseout", (event) => {
      const button = event.target;
      if (
        button.classList.contains("btn-assign") &&
        button.classList.contains("assigned")
      ) {
        button.textContent = "Assigned";
      }
    });

    // Logic for student selection checkboxes and unique ID generation
    const checkboxes = document.querySelectorAll(".student-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", function () {
        const row = this.closest("tr");
        const idCell = row.querySelector(".unique-id-cell");
        const eventName = row.dataset.event;
        const studentName = this.dataset.studentName;
        const newStatus = this.checked ? 1 : 0;

        if (this.checked) {
          if (!eventCounters[eventName]) eventCounters[eventName] = 0;
          eventCounters[eventName]++;
          const prefix =
            eventPrefixes[eventName] || eventName.substring(0, 2).toUpperCase();
          const idNumber = String(eventCounters[eventName]).padStart(2, "0");
          const uniqueId = `${prefix}${idNumber}`;
          idCell.textContent = uniqueId;
          row.dataset.uniqueId = uniqueId;
          updateStudentStatus(studentName, newStatus, uniqueId);
        } else {
          // Note: Decrementing counter on uncheck can be complex if not done in order.
          // This logic simply removes the ID.
          idCell.textContent = "";
          delete row.dataset.uniqueId;
          updateStudentStatus(studentName, newStatus, null);
        }
      });
    });
  }

  // Form submission for creating a new room
  if (createRoomForm) {
    createRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;

      const roomNumber = document.getElementById("roomNumber").value.trim();
      const eventName = document.getElementById("eventName").value.trim();

      if (!roomNumber || !eventName) {
        showNotification("Please fill all fields", "error");
        isSubmitting = false;
        return;
      }

      try {
        const res = await fetch("/rooms/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomNumber, eventName }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showNotification(
            `✅ ${data.message}. You can now add judges.`,
            "success"
          );
          createRoomForm.reset();
        } else {
          showNotification(
            `❌ ${data.error || "Could not create room"}`,
            "error"
          );
        }
      } catch (err) {
        console.error(err);
        showNotification("❌ Server error while creating room", "error");
      } finally {
        isSubmitting = false;
      }
    });
  }

  // Form submission for assigning a judge to a room
  if (assignRoomForm) {
    assignRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const judgeName = document.getElementById("judgeName").value.trim();
      const roomNumber = document.getElementById("roomNo").value.trim();
      const judgeEmail = prompt("Enter judge email:");

      if (!judgeName || !roomNumber || !judgeEmail) {
        showNotification(
          "Please fill all fields and provide an email.",
          "error"
        );
        return;
      }

      try {
        const res = await fetch("/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ judgeName, judgeEmail, roomNumber }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showNotification(data.message, "success");
          if (data.credentials) {
            showCredentials(
              data.credentials.username,
              data.credentials.password
            );
          }
          assignRoomForm.reset();
        } else {
          showNotification(data.error || "Could not assign judge", "error");
          if (credentialsOutput) credentialsOutput.style.display = "none";
        }
      } catch (err) {
        console.error(err);
        showNotification("Server error while assigning judge", "error");
        if (credentialsOutput) credentialsOutput.style.display = "none";
      }
    });
  }

  // Modal Triggers
  if (addEventBtn) {
    addEventBtn.addEventListener("click", () => {
      const fields = `
        <input type="text" name="eventName" placeholder="Event Name" required>
        <input type="text" name="school" placeholder="Associated School">
        <input type="text" name="category" placeholder="Category">
      `;
      openModal("Add New Event", fields);
    });
  }

  if (addJudgeBtn) {
    addJudgeBtn.addEventListener("click", () => {
      const fields = `
        <input type="text" name="judgeName" placeholder="Judge Name" required>
        <input type="email" name="email" placeholder="Email Address">
        <input type="text" name="expertise" placeholder="Expertise (comma-separated)">
      `;
      openModal("Add New Judge", fields);
    });
  }

  // Modal Closing Events
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeModal);
  }
  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      closeModal();
    }
  });

  // Generic Modal Form Submission (for logging data, etc.)
  const modalForm = document.getElementById("modalForm");
  if (modalForm) {
    modalForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(this);
      for (let [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
      }
      // Add actual submission logic here (e.g., another fetch call)
      showNotification("Data logged to console.", "success");
      closeModal();
    });
  }
});
