# Backend — DevS Attendance API

Express 5 REST API that uses **Google Sheets as the data layer** for the DevS Attendance System.

---

## Table of Contents

- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Auth — Login](#auth--login)
  - [Users — Create User](#users--create-user)
  - [Upload — Sheet Management](#upload--sheet-management)
  - [Attendance](#attendance)
  - [History](#history)
  - [Profile](#profile)

---

## Setup

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and fill in all values (see [Environment Variables](#environment-variables)).

---

## Environment Variables

Create a `backend/.env` file with the following keys:

```env
# Google Service Account credentials
GOOGLE_TYPE=service_account
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CLIENT_CERT_URL=your_cert_url

# App config
PORT=3000
ATTENDANCE_SHEET=your_master_google_sheet_id
ALLOWED_ORIGIN=http://localhost:5173
```

> `ALLOWED_ORIGIN` accepts a comma-separated list for multiple origins:  
> `http://localhost:5173,https://your-frontend.vercel.app`

---

## Running the Server

| Command | Description |
|---|---|
| `npm run dev` | Development — watch mode with `--env-file` |
| `npm start` | Production |
| `npm run build` | Syntax check via `node --check` |

Server starts on `http://localhost:3000` (or the value of `PORT`).

---

## Project Structure

```
backend/
├── server.js                  # Entry point — loads .env, starts HTTP server
├── app.js                     # Express app — middleware, CORS, routes, error handler
├── routes/
│   ├── index.js               # Mounts all routers under /api
│   ├── loginRoutes.js
│   ├── createUserRoutes.js
│   ├── uploadSheetRoutes.js
│   ├── attendanceSheetRoutes.js
│   ├── HistoryRoutes.js
│   └── profileRoutes.js
├── controller/                # Route handlers (req → res)
├── storage/                   # Google Sheets read/write logic
└── middleware/
    ├── googlesheetsapi.js     # Lazy singleton — Google Sheets v4 client
    ├── encrypter.js           # SHA-256 + salt password hashing
    └── passwordChecker.js     # Password verification
```

---

## API Reference

Base URL: `http://localhost:3000/api`

All JSON responses follow the shape:

```json
{ "success": true | false, "message": "...", ... }
```

---

### Health

#### `GET /api/health`

No authentication required. Used for uptime checks.

**Response `200`**
```json
{
  "success": true,
  "status": "server is running"
}
```

---

### Auth — Login

#### `POST /api/login`

Authenticates a user by comparing the supplied password against the salted SHA-256 hash stored in the Users sheet.

**Request body**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Login successful",
  "user": ["username", "name", "email", "department", "team", "role"],
  "admin": false
}
```

**Error responses**

| Status | Message |
|---|---|
| `401` | `"Invalid credentials"` |
| `500` | `"Server error"` |

---

### Users — Create User

#### `POST /api/createuser`

Creates a new user account. Passwords are hashed with SHA-256 + random salt before being written to the Users sheet. Intended for admin use only.

**Request body**
```json
{
  "username": "string",
  "name": "string",
  "roll_number": "string",
  "department": "string",
  "team": "string",
  "role": "string",
  "password": "string"
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "User created successfully"
}
```

**Error responses**

| Status | Message |
|---|---|
| `401` | `"Username already exists"` |
| `500` | `"Server error"` / `"Failed to create user"` |

---

### Upload — Sheet Management

#### `POST /api/upload/validate`

Validates a Google Sheet before committing it. Checks:
- Sheet accessibility
- Required headers: `name`, `roll_number`, `mail_id`, `department`, `attendance`
- Optional headers: `commit`, `type`, `marked_by`
- Data types per column (strings, integers, email, checkbox)
- Duplicate sheet detection

**Request body**
```json
{
  "sheetlink": "https://docs.google.com/spreadsheets/d/SHEET_ID/..."
}
```

> Also accepts `sheet_link` as the key (backwards-compatible).

**Response `200`** — sheet is valid
```json
{
  "success": true,
  "message": "Sheet is valid",
  "headers": ["name", "roll_number", "mail_id", "department", "attendance"],
  "rowCount": 42,
  "errors": []
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Missing sheet link"` / `"Invalid Google Sheet URL"` / `"Header error, check the headers"` |
| `403` | `"Sheet is not accessible"` |
| `409` | `"This sheet has already been uploaded to the system"` / `"The sheet is closed"` |
| `500` | `"Error validating sheet"` |

---

#### `POST /api/upload/uploadSheet`

Registers a validated sheet in the SHEET_HISTORY log and marks it as active.

**Request body**
```json
{
  "sheet_link": "https://docs.google.com/spreadsheets/d/SHEET_ID/...",
  "event_name": "string",
  "uploaded_by": "string"
}
```

> Also accepts `sheetlink` as the key (backwards-compatible).

**Response `200`**
```json
{
  "success": true,
  "message": "Sheet uploaded to history successfully",
  "data": {
    "sheet_name": "string",
    "sheet_id": "string",
    "event_name": "string",
    "uploaded_by": "string",
    "uploaded_at": "2026-02-21T00:00:00.000Z",
    "status": "active"
  }
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Missing required fields"` / `"Invalid Google Sheet URL"` |
| `403` | `"Sheet is not accessible"` |
| `409` | `"This sheet has already been uploaded to the system"` |
| `500` | `"Error uploading sheet to history"` |

---

### Attendance

All attendance routes operate on a **spreadsheet ID** (not the full URL). Results are cached in-memory per spreadsheet ID to reduce Sheets API calls.

---

#### `GET /api/attendance`

Fetches full sheet data and caches it. Auto-adds `commit` and `marked_by` columns if they don't exist.

**Query params**

| Param | Required | Description |
|---|---|---|
| `sheet_link` | Yes | Full Google Sheets URL |

**Response `200`**
```json
{
  "success": true,
  "message": "Sheet details fetched successfully",
  "cached": false,
  "commitColumnAdded": false,
  "markedByColumnAdded": false,
  "data": { ... }
}
```

---

#### `GET /api/attendance/display`

Returns the list of **uncommitted** students and attendance counts from the in-memory cache. Must call `GET /api/attendance` first.

**Query params**

| Param | Required | Description |
|---|---|---|
| `spreadsheet_id` | Yes | Spreadsheet ID (not the full URL) |

**Response `200`**
```json
{
  "success": true,
  "message": "Display data retrieved successfully",
  "data": {
    "registered": 38,
    "onSpotCount": 4,
    "presentCount": 20,
    "absentCount": 22,
    "students": [
      { "id": 1, "rollNumber": "22CS001", "status": "Present", "isCommitted": false }
    ]
  }
}
```

---

#### `POST /api/attendance/commit`

Marks the given roll numbers as committed (attendance locked) and records the officer's username in the `marked_by` column. Invalidates the in-memory cache for the sheet.

**Request body**
```json
{
  "spreadsheet_id": "string",
  "roll_numbers": ["22CS001", "22CS002"],
  "username": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "...",
  "data": {
    "updatedCount": 2,
    "committedRollNumbers": ["22CS001", "22CS002"]
  }
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Spreadsheet ID is required"` / `"Roll numbers array is required"` / `"Username is required"` |
| `500` | `"Failed to commit attendance"` |

---

#### `POST /api/attendance/addonspot`

Appends a new row to the sheet for a walk-in member. Sets `attendance=TRUE`, `commit=TRUE`, `type=ON-SPOT`, and writes the officer's username to `marked_by`. Invalidates the cache.

**Request body**
```json
{
  "spreadsheet_id": "string",
  "name": "string",
  "roll_number": "string",
  "mail_id": "string",
  "department": "string",
  "username": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Student added on-spot successfully",
  "data": { ... }
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Spreadsheet ID is required"` / `"All student fields are required"` / `"Username is required"` |
| `500` | `"Failed to add student on-spot"` |

---

#### `GET /api/attendance/export`

Fetches fresh data and returns a `.zip` file containing two Excel sheets:
- `present_students.xlsx` — students marked present
- `all_students.xlsx` — all students

Also replenishes the in-memory cache.

**Query params**

| Param | Required | Description |
|---|---|---|
| `spreadsheet_id` | Yes | Spreadsheet ID |

**Response `200`** — `application/zip` binary file download

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Spreadsheet ID is required"` / `"No student data available to export"` |
| `500` | `"Failed to export attendance"` |

---

#### `DELETE /api/attendance/cache`

Clears the in-memory sheet cache. Pass a `spreadsheet_id` to clear a single sheet, or omit it to clear all.

**Request body** *(optional)*
```json
{
  "spreadsheet_id": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "All cache cleared"
}
```

---

### History

#### `GET /api/history`

Returns all event records from the SHEET_HISTORY log.

**Response `200`**
```json
{
  "success": true,
  "message": "History records retrieved successfully",
  "data": [
    {
      "sheet_name": "string",
      "sheet_link": "string",
      "sheet_id": "string",
      "event_name": "string",
      "uploaded_by": "string",
      "uploaded_at": "string",
      "status": "active | complete",
      "closed_at": "string"
    }
  ]
}
```

---

#### `GET /api/history/event`

Fetches student-level data for a specific past event. Results are cached in-memory.

**Query params**

| Param | Required | Description |
|---|---|---|
| `sheet_link` | Yes | Full Google Sheets URL |

**Response `200`**
```json
{
  "success": true,
  "cached": false,
  "data": {
    "sheetName": "string",
    "spreadsheetId": "string",
    "registered": 38,
    "presentCount": 25,
    "onSpotCount": 3,
    "absentCount": 16,
    "students": [
      { "id": 1, "rollNumber": "22CS001", "name": "string", "department": "string", "isPresent": true }
    ]
  }
}
```

---

#### `GET /api/history/event/export`

Same as `GET /api/attendance/export` but for a historical event. Returns a `.zip` with `present_students.xlsx` and `all_students.xlsx`.

**Query params**

| Param | Required | Description |
|---|---|---|
| `spreadsheet_id` | Yes | Spreadsheet ID |

**Response `200`** — `application/zip` binary file download

---

### Profile

#### `POST /api/profile`

Returns profile data for a specific user.

**Request body**
```json
{
  "username": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "user": { ... }
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Username is required"` |
| `404` | `"User not found"` |
| `500` | `"Server error"` |

---

#### `POST /api/profile/getsession`

Returns all sessions (uploaded sheets) associated with a user.

**Request body**
```json
{
  "username": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "sessions": [ ... ]
}
```

---

#### `POST /api/profile/close`

Closes an active session by setting its status to `Complete` and recording the `closed_at` timestamp.

**Request body**
```json
{
  "username": "string",
  "sheet_id": "string"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Session closed successfully",
  "closed_at": "2026-02-21T00:00:00.000Z"
}
```

**Error responses**

| Status | Message |
|---|---|
| `400` | `"Username and sheet_id are required"` / *(business rule message)* |
| `500` | `"Server error"` |

---

## Error Handling

All unhandled errors pass through the global error handler in `app.js`:

- **Development** — returns `message` and `stack`
- **Production** — returns `"Internal server error"` only (no stack trace)

Unknown routes return:
```json
{ "success": false, "message": "Route not found" }
```
