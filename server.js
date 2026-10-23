// Student Management System - Express REST API + static frontend (SQLite).
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite"); // built into Node >= 22.13
const express = require("express");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number   TEXT NOT NULL UNIQUE,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    phone         TEXT,
    date_of_birth TEXT,
    gender        TEXT,
    course        TEXT NOT NULL,
    year          INTEGER,
    address       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const FIELDS = [
  "roll_number", "first_name", "last_name", "email", "phone",
  "date_of_birth", "gender", "course", "year", "address",
];
const SORTABLE = new Set(["roll_number", "first_name", "last_name", "email", "course", "year", "created_at"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const GENDERS = new Set(["", "Female", "Male", "Non-binary", "Prefer not to say"]);

const SEED = [
  ["S1001", "Amara", "Okafor", "amara.okafor@example.edu", "+31 6 1234 5678", "2004-03-14", "Female", "Computer Science", 2, "12 Canal Street, Delft"],
  ["S1002", "Lucas", "de Vries", "lucas.devries@example.edu", "+31 6 2345 6789", "2003-11-02", "Male", "Mechanical Engineering", 3, "48 Tulip Lane, Rotterdam"],
  ["S1003", "Sofia", "Martinez", "sofia.martinez@example.edu", "+31 6 3456 7890", "2005-07-21", "Female", "Biology", 1, "7 Harbour Road, The Hague"],
  ["S1004", "Noah", "Jansen", "noah.jansen@example.edu", "", "2002-01-30", "Male", "Business Administration", 4, "91 Windmill Avenue, Leiden"],
];

function initDb(dbPath, seed = false) {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  if (seed) {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM students").get();
    if (c === 0) {
      const ins = db.prepare(
        `INSERT INTO students (${FIELDS.join(", ")}) VALUES (${FIELDS.map(() => "?").join(", ")})`
      );
      for (const s of SEED) ins.run(...s);
    }
  }
  return db;
}

/** Normalise incoming JSON into an object of trimmed values. */
function clean(payload) {
  const data = {};
  for (const f of FIELDS) {
    let v = payload[f];
    if (typeof v === "string") v = v.trim();
    data[f] = v === undefined ? null : v;
  }
  return data;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Validates (and normalises, in place) `data`. Returns an object of field errors. */
function validate(data) {
  const errors = {};
  const required = [
    ["roll_number", "Roll number"], ["first_name", "First name"],
    ["last_name", "Last name"], ["email", "Email"], ["course", "Course"],
  ];
  for (const [f, label] of required) {
    if (!data[f]) errors[f] = `${label} is required.`;
  }
  if (data.email && !(typeof data.email === "string" && EMAIL_RE.test(data.email))) {
    errors.email = "Enter a valid email address.";
  }

  if (data.date_of_birth) {
    if (!isValidDate(data.date_of_birth)) errors.date_of_birth = "Use the format YYYY-MM-DD.";
    else if (data.date_of_birth > todayISO()) errors.date_of_birth = "Date of birth cannot be in the future.";
  } else {
    data.date_of_birth = null;
  }

  if (data.gender !== null && !GENDERS.has(data.gender)) {
    errors.gender = "Choose one of the listed options.";
  }

  if (data.year === "" || data.year === null) {
    data.year = null;
  } else {
    const n = Number(data.year);
    if (Number.isInteger(n) && n >= 1 && n <= 8) data.year = n;
    else errors.year = "Year must be a number from 1 to 8.";
  }

  for (const f of ["phone", "address", "gender"]) {
    if (!data[f]) data[f] = null;
  }
  return errors;
}

function createApp({ dbPath = path.join(__dirname, "students.db"), seed = false } = {}) {
  const app = express();
  const db = initDb(dbPath, seed);
  app.locals.db = db; // so tests can close it

  const staticDir = path.join(__dirname, "static");
  const sendIndex = (_req, res) => res.sendFile(path.join(staticDir, "index.html"));

  app.use(express.json());

  const parseId = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);
  const byId = (id) => db.prepare("SELECT * FROM students WHERE id = ?").get(id);

  function conflictErrors(data, excludeId = null) {
    const errors = {};
    for (const [f, label] of [["roll_number", "roll number"], ["email", "email"]]) {
      let sql = `SELECT id FROM students WHERE ${f} = ? COLLATE NOCASE`;
      const params = [data[f]];
      if (excludeId !== null) {
        sql += " AND id != ?";
        params.push(excludeId);
      }
      if (db.prepare(sql).get(...params)) errors[f] = `A student with this ${label} already exists.`;
    }
    return errors;
  }

  function jsonBody(req, res) {
    const b = req.body;
    if (!req.is("application/json") || b === null || typeof b !== "object" || Array.isArray(b)) {
      res.status(400).json({ error: "Request body must be JSON." });
      return null;
    }
    return b;
  }

  // ---------- API ----------
  app.get("/api/students", (req, res) => {
    const q = String(req.query.q ?? "").trim();
    let sort = String(req.query.sort ?? "created_at");
    const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    if (!SORTABLE.has(sort)) sort = "created_at";

    let sql = "SELECT * FROM students";
    let params = [];
    if (q) {
      const like = `%${q}%`;
      sql += " WHERE roll_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?" +
             " OR (first_name || ' ' || last_name) LIKE ? OR email LIKE ? OR course LIKE ?";
      params = Array(6).fill(like);
    }
    sql += ` ORDER BY ${sort} COLLATE NOCASE ${order}, id ASC`;
    res.json(db.prepare(sql).all(...params));
  });

  app.get("/api/students/:id", (req, res) => {
    const id = parseId(req);
    const row = id === null ? undefined : byId(id);
    if (!row) return res.status(404).json({ error: "Student not found." });
    res.json(row);
  });

  app.post("/api/students", (req, res) => {
    const payload = jsonBody(req, res);
    if (!payload) return;
    const data = clean(payload);
    let errors = validate(data);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed.", fields: errors });
    errors = conflictErrors(data);
    if (Object.keys(errors).length) return res.status(409).json({ error: "Duplicate record.", fields: errors });

    const info = db
      .prepare(`INSERT INTO students (${FIELDS.join(", ")}) VALUES (${FIELDS.map(() => "?").join(", ")})`)
      .run(...FIELDS.map((f) => data[f]));
    res.status(201).json(byId(Number(info.lastInsertRowid)));
  });

  app.put("/api/students/:id", (req, res) => {
    const id = parseId(req);
    if (id === null || !byId(id)) return res.status(404).json({ error: "Student not found." });
    const payload = jsonBody(req, res);
    if (!payload) return;
    const data = clean(payload);
    let errors = validate(data);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed.", fields: errors });
    errors = conflictErrors(data, id);
    if (Object.keys(errors).length) return res.status(409).json({ error: "Duplicate record.", fields: errors });

    const sets = FIELDS.map((f) => `${f} = ?`).join(", ");
    db.prepare(`UPDATE students SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
      .run(...FIELDS.map((f) => data[f]), id);
    res.json(byId(id));
  });

  app.delete("/api/students/:id", (req, res) => {
    const id = parseId(req);
    const info = id === null ? { changes: 0 } : db.prepare("DELETE FROM students WHERE id = ?").run(id);
    if (info.changes === 0) return res.status(404).json({ error: "Student not found." });
    res.json({ deleted: id });
  });

  // ---------- Frontend ----------
  app.get("/", sendIndex);
  app.use("/static", express.static(staticDir));

  // ---------- Errors ----------
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
    sendIndex(req, res);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed" || err.status === 400) {
      return res.status(400).json({ error: "Request body must be JSON." });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  createApp({ seed: true }).listen(port, "127.0.0.1", () => {
    console.log(`Student Management System running at http://127.0.0.1:${port}`);
  });
}
