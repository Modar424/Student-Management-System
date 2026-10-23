# Student Management System

A full-stack web app for managing student records.

- **Frontend:** HTML, CSS and vanilla JavaScript (`static/`)
- **Backend:** Node.js + Express REST API (`server.js`)
- **Database:** SQLite via Node's built-in `node:sqlite` (created automatically as `students.db`)

## Features
Add students, update records, delete records (with confirmation), view student details, plus search and sorting.

## Run
Requires **Node.js 22.13 or newer**.
```bash
npm install
npm start
```
Open http://127.0.0.1:5000 (set `PORT` to change it). Sample students are added on first run.

## REST API
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/students?q=&sort=&order=` | List / search / sort |
| GET | `/api/students/:id` | View one student |
| POST | `/api/students` | Create |
| PUT | `/api/students/:id` | Update |
| DELETE | `/api/students/:id` | Delete |

Errors return JSON: `400` validation (with per-field `fields`), `404` not found, `409` duplicate roll number or email.

## Test
```bash
npm test
```
