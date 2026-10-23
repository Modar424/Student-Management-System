const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");

const VALID = {
  roll_number: "T-001", first_name: "Ada", last_name: "Lovelace",
  email: "ada@example.edu", phone: "123", date_of_birth: "2003-12-10",
  gender: "Female", course: "Mathematics", year: 2, address: "London",
};

let app, server, base, dir;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sms-"));
  app = createApp({ dbPath: path.join(dir, "test.db") });
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  app.locals.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};
const create = (over = {}) => call("POST", "/api/students", { ...VALID, ...over });

test("frontend is served", async () => {
  const r = await call("GET", "/");
  assert.equal(r.status, 200);
  assert.match(r.text, /Student/);
  assert.equal((await call("GET", "/static/app.js")).status, 200);
  assert.equal((await call("GET", "/static/styles.css")).status, 200);
});

test("create and get", async () => {
  const r = await create();
  assert.equal(r.status, 201);
  const g = await call("GET", `/api/students/${r.json.id}`);
  assert.equal(g.status, 200);
  assert.equal(g.json.first_name, "Ada");
});

test("list, search, sort", async () => {
  await create();
  await create({ roll_number: "T-002", email: "b@example.edu", first_name: "Zed", course: "Art" });
  assert.equal((await call("GET", "/api/students")).json.length, 2);
  assert.deepEqual((await call("GET", "/api/students?q=zed")).json.map((s) => s.first_name), ["Zed"]);
  assert.equal((await call("GET", "/api/students?sort=first_name&order=desc")).json[0].first_name, "Zed");
  assert.equal((await call("GET", "/api/students?sort=drop_table")).json.length, 2);
});

test("validation", async () => {
  const r = await create({ first_name: "", email: "nope", year: 99, date_of_birth: "2999-01-01" });
  assert.equal(r.status, 400);
  for (const k of ["first_name", "email", "year", "date_of_birth"]) assert.ok(k in r.json.fields, k);
  const bad = await fetch(base + "/api/students", { method: "POST", body: "x" });
  assert.equal(bad.status, 400);
  const badJson = await fetch(base + "/api/students", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops",
  });
  assert.equal(badJson.status, 400);
});

test("duplicates", async () => {
  await create();
  const r = await create();
  assert.equal(r.status, 409);
  assert.ok("roll_number" in r.json.fields);
  assert.ok("email" in r.json.fields);
});

test("update", async () => {
  const sid = (await create()).json.id;
  const r = await call("PUT", `/api/students/${sid}`, { ...VALID, course: "Physics" });
  assert.equal(r.status, 200);
  assert.equal(r.json.course, "Physics");
  assert.equal((await call("PUT", "/api/students/999", VALID)).status, 404);
  const other = (await create({ roll_number: "T-002", email: "o@example.edu" })).json.id;
  assert.equal((await call("PUT", `/api/students/${other}`, VALID)).status, 409);
});

test("delete", async () => {
  const sid = (await create()).json.id;
  assert.equal((await call("DELETE", `/api/students/${sid}`)).status, 200);
  assert.equal((await call("GET", `/api/students/${sid}`)).status, 404);
  assert.equal((await call("DELETE", `/api/students/${sid}`)).status, 404);
});
