# Comprehensive Interview Preparation Guide: Event Judging Application

This document contains an extensive list of interview questions and answers based on your Event Judging Application. It covers the foundational technical choices, deep technical implementation details, security, scalability, as well as non-technical managerial, behavioral, and architectural topics.

---

## 1. General Project Overview & Impact

**Q: Can you explain your Event Judging Application in a few sentences?**
**A:** It is a role-based, full-stack web application built using Node.js, Express, and MySQL. It digitizes the event evaluation process for school competitions, allowing admins to manage rooms, assign judges, and import student data, while enabling judges to submit scores in real-time. It replaces manual paper-based scoring, improving speed, accuracy, and transparency.

**Q: How does this application add value to the organization?**
**A:** It drastically reduces administrative overhead. In manual setups, collating scores from multiple judges across various rooms takes hours and is prone to calculation errors. This system centralizes data, generates real-time leaderboards, ensures standardization of grading criteria (event parameters), and provides immediate communication channels (help requests/announcements) between judges and admins.

**Q: How do you measure the success or impact of this application?**
**A:** Success is measured by the reduction in time taken to announce results post-event (e.g., from hours of manual tallying to seconds), the elimination of calculation errors, and positive feedback from judges regarding ease of use. Additionally, the number of resolved "Help Requests" indicates the system successfully facilitated communication during the event.

---

## 2. Backend & Node.js/Express Fundamentals

**Q: Why did you choose Node.js and Express for this project?**
**A:** Node.js is excellent for I/O-heavy operations and handling multiple concurrent requests, which is perfect for an event where multiple judges are submitting scores simultaneously. Express provides a minimal, flexible routing system that made it easy to separate admin, judge, and API routes cleanly. 

**Q: Node.js is single-threaded. How does it handle concurrent requests from multiple judges scoring at the same time?**
**A:** Node.js uses an event-driven, non-blocking I/O model. While the main thread is single, it offloads I/O operations (like querying the MySQL database) to the system kernel (via libuv). When the database query finishes, a callback is placed in the event loop queue to be executed. This allows it to handle thousands of concurrent judge submissions without blocking.

**Q: Explain how you handled authentication and authorization in this app.**
**A:** I used `express-session` to maintain stateful user sessions and `bcrypt` for hashing passwords before storing them in the database. For authorization, I implemented custom middleware functions (like `requireAdmin` and `requireJudge`). These functions check the `req.session.user.role` before allowing access to specific route groups, ensuring judges cannot access the admin dashboard and vice versa.

**Q: How did you structure your routes and why?**
**A:** I used Express Routers to modularize the application. For example, `adminRouter.js`, `judgeRouter.js`, `roomsRouter.js`, and `communicationsRouter.js`. This separation of concerns keeps `server.js` clean, makes the codebase easier to maintain, and allows multiple developers to work on different features without merge conflicts.

---

## 3. Deep Technical: Data Processing & Edge Cases

**Q: I see you used `express-session`. What are the limitations of the default MemoryStore in production, and how do you fix it?**
**A:** The default `MemoryStore` is intentionally not designed for production. It leaks memory under heavy load and doesn't scale across multiple Node.js instances (if a load balancer sends a request to server B, the session created on server A is lost). To fix this, I would use a persistent session store like `connect-redis` or `express-mysql-session` to store sessions in a separate database or cache.

**Q: How did you handle CSV uploads for importing students/events? What happens if an admin uploads a 5GB CSV file?**
**A:** I used `multer` to handle the file upload and `csv-parser` to stream the data. If an admin uploaded a massive file, processing it all at once could crash the Node process (Out of Memory). Streaming it chunk-by-chunk using `fs.createReadStream().pipe(csv())` keeps memory usage low. I also added file size limits in `multer` to prevent accidental large uploads.

---

## 4. Database Architecture & Optimization

**Q: Why MySQL over a NoSQL database like MongoDB for this application?**
**A:** The data is highly relational. A student score depends on a specific student, a specific judge, a specific event, and a specific parameter. Using a relational database with strict foreign key constraints ensures data integrity (e.g., you can't have a score for a non-existent student). SQL JOINs also make it very efficient to generate complex leaderboards.

**Q: Can you explain the schema for storing scores and ensuring data integrity?**
**A:** The `student_scores` table maps a `score` to a `student_id` (foreign key), `event_id`, `parameter_id` (the grading criteria), and `judge_id`. To ensure a judge doesn't accidentally score the same student twice for the same parameter, I set a unique composite constraint on `(student_id, event_id, parameter_id, judge_id)`. The database physically rejects duplicate entries.

**Q: What is the purpose of the `judge_assignments_history` table? Why not just update the `users` table with the current `room_id`?**
**A:** Updating the `users.room_id` tells us where the judge is *now*, but `judge_assignments_history` provides an audit trail. If a judge was moved mid-event, or if we need to trace back who evaluated a room at 10:00 AM versus 1:00 PM, the history table is crucial for accountability and debugging scoring disputes.

**Q: How do you prevent Race Conditions? For example, if two admins try to assign the same judge to two different rooms at the exact same millisecond?**
**A:** This can be handled at the database level using transactions and row-level locking (e.g., `SELECT ... FOR UPDATE`), or by ensuring the `users` table acts as the single source of truth for current assignment. A transaction ensures that checking if the judge is free and updating their room happens as one atomic operation.

**Q: How do you handle database connections and performance?**
**A:** I used the `mysql2` package. To improve query performance, I added indexes on frequently queried columns, such as `idx_judge_id` and `idx_student_event` in the `student_scores` table, and unique indexes on room numbers and student unique IDs.

---

## 5. Frontend & User Interface

**Q: You used EJS for the frontend. What are the pros and cons of this approach?**
**A:** **Pros:** EJS allows for server-side rendering (SSR), meaning the HTML is fully generated on the server before being sent to the client. This is fast, secure (hides logic from the client), and SEO-friendly. It also easily injects backend data into templates.
**Cons:** It tightly couples the frontend and backend. Unlike a React/Vue SPA, changing the UI often requires reloading the page, which can feel less dynamic.

**Q: How do you handle dynamic actions, like a judge requesting help, without reloading the whole page?**
**A:** I built an API layer (`judgeApiRouter.js`, `communicationsRouter.js`) that the frontend can call using asynchronous JavaScript (Fetch API or AJAX). This allows the frontend to send a JSON payload to request help or submit a score, and update the UI based on the response without a full page refresh.

---

## 6. Security & Authorization

**Q: How did you secure user passwords? What is a salt?**
**A:** I used `bcrypt` to hash passwords. `bcrypt` automatically generates a "salt"—a random string appended to the password before hashing. This protects against dictionary attacks and rainbow tables because even if two users have the password "password123", their hashes will be completely different due to the unique salt.

**Q: How do you protect against Cross-Site Scripting (XSS) since you are using EJS templates?**
**A:** EJS by default escapes HTML characters when you output variables using the `<%= variable %>` syntax. This prevents malicious scripts stored in the database (e.g., a student named `<script>alert(1)</script>`) from executing in the judge's browser. I strictly avoid the unescaped `<%- variable %>` tag unless rendering explicitly safe, sanitized HTML.

**Q: How are you protecting the Admin routes from being accessed by Judges?**
**A:** I implemented custom middleware (e.g., `requireAdmin`). Every request hitting an `/admin/*` route passes through this middleware first. It checks `req.session.user.role === "Administrator"`. If false, it returns a 403 Forbidden or redirects to the login page.

---

## 7. System Design & Future Scalability

**Q: Currently, the app uses standard HTTP requests. If you wanted to make the leaderboard or announcements truly "real-time", how would you do it?**
**A:** I would integrate **WebSockets** (using a library like Socket.io). Instead of the client constantly refreshing the page (polling), the server maintains a persistent open connection with the client. The moment a new score is submitted, the server pushes the updated leaderboard directly to the admin dashboard.

**Q: What is your deployment strategy? How would you scale this application if the event grew from 500 students to 50,000 students?**
**A:** 
1. **Containerization:** Dockerize the Node.js app so it runs identically across all environments.
2. **Database:** Host MySQL on a managed service like AWS RDS or Google Cloud SQL. Implement connection pooling and read replicas for heavy read operations (like the leaderboard).
3. **Session Management:** Move session storage from memory to **Redis**. This allows multiple Node.js instances to share session data.
4. **Load Balancing:** Run multiple instances of the Node.js container behind a load balancer (like NGINX or AWS ALB).

---

## 8. Non-Technical: Managerial, Stakeholder & Problem Solving

**Q: What was the biggest technical challenge you faced while building this app, and how did you overcome it?**
**A:** *(Sample Answer)* Managing the complex state of Room assignments. Sometimes a judge needed to be swapped out mid-event. I had to ensure that when a judge is unassigned from a room, their incomplete scores aren't lost, and the new judge can pick up where they left off. I solved this by strictly tying scores to the `student_id` and `event_id` rather than just the room, and tracking history in the `judge_assignments_history` table.

**Q: How did you gather requirements from the event organizers? Did you face any ambiguity?**
**A:** I conducted initial meetings with the organizers to understand their pain points with the old paper system. There was ambiguity around how judges should handle ties or ask questions. By prototyping the "Help Request" and "Announcements" UI early on, I helped them visualize the workflow, which led them to clarify their exact requirements before deep development started.

**Q: Describe a time when organizers requested a feature mid-development that threatened the timeline.**
**A:** Halfway through, they realized judges needed a way to contact admins for clarifications without leaving the room. I evaluated the request and realized building a full live-chat was out of scope. I negotiated a Minimum Viable Product (MVP): a simple "Help Request" ticketing system and a one-way "Announcement" broadcast from admins. This satisfied their core need without delaying the launch.

**Q: How did you plan the timeline and estimate the effort for this project?**
**A:** I broke the project down into Epics (Authentication, Admin Dashboard, Judge Portal, Scoring Logic, Real-time Comms). I estimated each using a buffer for unexpected bugs. I prioritized the core scoring logic first because without it, the app is useless. Features like UI polish and advanced analytics were scheduled for the end.

---

## 9. Non-Technical: Risk Management & Crisis Handling

**Q: What was your fallback plan (Disaster Recovery) if the server crashed on the day of the live event?**
**A:** 
1. **Code/Infra Level:** Using process managers like PM2 to automatically restart the Node app if it crashes.
2. **Data Level:** Ensuring the database performs automated snapshots.
3. **Process Level:** We kept a master CSV of all students and a stack of paper grading sheets on standby in every room. If the system went down unrecoverably, judges were instructed to switch to paper immediately so the event wouldn't halt.

**Q: If a critical bug is discovered on the day of the event, what is your action plan?**
**A:** 
1. **Triage:** Replicate the bug and determine its impact (e.g., is it blocking scoring, or is it a UI glitch?).
2. **Communication:** Inform the admins immediately so they can instruct judges (e.g., via the Announcements feature).
3. **Mitigation:** If it's a data entry issue, rely on the raw database logs or CSV backups. Provide a temporary workaround.
4. **Hotfix:** Apply a fix locally, test it thoroughly, and deploy it as quickly as possible. 

**Q: How did you test the application before the live event?**
**A:** I performed Unit Testing for scoring calculations and Integration Testing for the API routes. Most importantly, we did a **Mock Run (UAT)** with a few volunteers acting as admins and judges. They clicked around randomly, submitted duplicate scores, and tried to break the system. This helped catch edge cases (like what happens if a judge double-clicks the submit button rapidly).

**Q: Tell me about a mistake you made on this project and what you learned from it.**
**A:** *(Sample Answer)* Initially, I tied scores directly to the `room_id`. I learned later that if a student moves rooms, or a room is dissolved, their scores could be orphaned. I realized the architecture was flawed. I refactored the database to tie scores directly to the `student_id` and `event_id`, decoupling it from the physical location. I learned the importance of normalizing database schemas based on the business entity, not just the physical layout.
