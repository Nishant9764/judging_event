# ISKCON Nandotsav - Event Judging Application

## Overview
The ISKCON Nandotsav Judging Application is a comprehensive, role-based web platform built to streamline the evaluation process for large-scale school events and competitions. It digitizes the traditional paper-based scoring system, offering real-time leaderboards, dynamic room assignments, and seamless communication between administrators and judges.

## How It Helps the Organization
- **Efficiency & Speed**: Eliminates manual data entry and score calculation. Judges input scores directly, and the system instantly updates leaderboards.
- **Transparency & Accuracy**: Ensures standard evaluation parameters across all events. Reduces human error in tallying scores.
- **Centralized Management**: Administrators can manage rooms, assign judges dynamically, and broadcast announcements from a single dashboard.
- **Real-time Coordination**: Built-in messaging and help request features allow judges to instantly communicate with admins if they face issues in their assigned rooms.

## Tech Stack
- **Backend**: Node.js, Express.js
- **Frontend**: EJS (Embedded JavaScript) Templates, HTML, CSS, JavaScript
- **Database**: MySQL (using `mysql2` driver)
- **Authentication**: `bcrypt` for password hashing, `express-session` for session management
- **Utilities**: `multer` & `csv-parser` for data import, `nodemailer` for email communications (if configured)

## Key Features
### Administrator Portal
- **Dashboard & Analytics**: View real-time statistics, active rooms, and overall progress.
- **Data Management**: Import students and events via CSV.
- **Room & Judge Allocation**: Create judging rooms, set capacities, and assign/reassign judges to specific rooms on the fly.
- **Leaderboard Generation**: Automatically calculate and display top performers based on submitted scores.
- **Communications**: Broadcast announcements to all judges and respond to help requests.

### Judge Portal
- **Assigned Rooms**: View current room assignment and the list of students/groups to evaluate.
- **Evaluation Form**: Score participants based on predefined event parameters (criteria) and max scores.
- **Help Requests**: Instantly request assistance from the admin if an issue arises during an event.
- **Status Updates**: Mark rooms as "done" once all evaluations are completed.

## Database Schema Highlights
The application relies on a structured relational database (`auth_db`):
- `users`: Stores Admin and Judge credentials and roles.
- `rooms`: Manages physical/virtual evaluation rooms and their statuses.
- `events` & `event_parameters`: Defines the competitions and their specific grading criteria.
- `schoolevents`: Stores the participants (students) and their group IDs.
- `student_scores`: Maps the scores given by judges to students for specific parameters.
- `announcements` & `messages`: Facilitates internal system communications.

## Setup and Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Judging-application1
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   PORT=8080
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=your_password
   DB_NAME=auth_db
   SESSION_SECRET=your_secret_key
   NODE_ENV=development
   ```

4. **Database Setup:**
   - Ensure MySQL is running.
   - Execute the SQL commands found in `Database.txt` to create the necessary tables and constraints.
   - Run the seeder (if available) to populate initial admin accounts.

5. **Run the Application:**
   ```bash
   # Development mode with nodemon
   npm run dev

   # Production mode
   npm start
   ```

6. **Access:**
   Navigate to `http://localhost:8080` in your web browser.

## License
ISC License
