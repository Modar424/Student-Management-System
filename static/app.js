(() => {
  const API = "/api/students";
  const $ = (s) => document.querySelector(s);
  const state = { students: [], sort: "created_at", order: "asc", q: "", editingId: null, current: null };

  const els = {
    rows: $("#rows"), empty: $("#empty"), count: $("#count"), search: $("#search"),
    sort: $("#sort"), orderBtn: $("#orderBtn"), addBtn: $("#addBtn"),
    detailDialog: $("#detailDialog"), detailBody: $("#detailBody"),
    formDialog: $("#formDialog"), form: $("#studentForm"), formTitle: $("#formTitle"),
    formError: $("#formError"), saveBtn: $("#saveBtn"), courses: $("#courses"),
    confirmDialog: $("#confirmDialog"), confirmText: $("#confirmText"), toast: $("#toast"),
  };
  const FIELDS = ["roll_number", "first_name", "last_name", "email", "phone", "date_of_birth", "gender", "course", "year", "address"];

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer;
  function toast(msg, isError = false) {
    els.toast.textContent = msg;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000);
  }

  async function api(path = "", options = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || "Something went wrong.");
      err.fields = body && body.fields;
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function load() {
    const params = new URLSearchParams({ sort: state.sort, order: state.order });
    if (state.q) params.set("q", state.q);
    try {
      state.students = await api("?" + params.toString());
      render();
    } catch (e) {
      els.count.textContent = "Could not load students.";
      toast("Could not load students. Check that the server is running.", true);
    }
  }

  function render() {
    const n = state.students.length;
    els.count.textContent = state.q
      ? `${n} ${n === 1 ? "match" : "matches"} for “${state.q}”`
      : `${n} ${n === 1 ? "student" : "students"} enrolled`;
    els.rows.innerHTML = state.students.map((s) => `
      <tr class="row" tabindex="0" data-id="${s.id}">
        <td class="roll">${esc(s.roll_number)}</td>
        <td class="name">${esc(s.first_name)} ${esc(s.last_name)}</td>
        <td>${esc(s.course)}</td>
        <td class="num">${s.year ?? '<span class="muted">–</span>'}</td>
        <td>${esc(s.email)}</td>
        <td class="actions">
          <button class="btn small" data-action="edit" data-id="${s.id}">Edit</button>
          <button class="btn small danger" data-action="delete" data-id="${s.id}">Delete</button>
        </td>
      </tr>`).join("");
    const empty = n === 0;
    els.empty.hidden = !empty;
    if (empty) {
      els.empty.innerHTML = state.q
        ? `<strong>No students match “${esc(state.q)}”</strong>Try a different name, roll number or course.`
        : `<strong>No students yet</strong>Add your first student to start the register.<br><button class="btn primary" data-action="add">Add student</button>`;
    }
    const courses = [...new Set(state.students.map((s) => s.course))];
    els.courses.innerHTML = courses.map((c) => `<option value="${esc(c)}">`).join("");
  }

  const find = (id) => state.students.find((s) => s.id === Number(id));
  const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");
  const fmtStamp = (t) => (t ? new Date(t.replace(" ", "T") + "Z").toLocaleString() : "");

  // ----- Details -----
  async function showDetails(id) {
    try {
      const s = await api("/" + id);
      state.current = s;
      const row = (k, v) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">Not provided</span>'}</dd>`;
      els.detailBody.innerHTML = `<dl class="details">
        <div class="hero"><b>${esc(s.first_name)} ${esc(s.last_name)}</b><span>${esc(s.roll_number)}</span></div>
        ${row("Course", s.course)}${row("Year of study", s.year)}${row("Email", s.email)}${row("Phone", s.phone)}
        ${row("Date of birth", fmtDate(s.date_of_birth))}${row("Gender", s.gender)}${row("Address", s.address)}
        ${row("Added", fmtStamp(s.created_at))}${row("Last updated", fmtStamp(s.updated_at))}
      </dl>`;
      if (!els.detailDialog.open) els.detailDialog.showModal();
    } catch (e) { toast(e.message, true); load(); }
  }

  // ----- Form -----
  function clearErrors() {
    els.formError.hidden = true;
    els.form.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
    els.form.querySelectorAll("[data-err]").forEach((e) => (e.textContent = ""));
  }
  function showErrors(fields) {
    let first = null;
    Object.entries(fields || {}).forEach(([k, msg]) => {
      const slot = els.form.querySelector(`[data-err="${k}"]`);
      const input = els.form.elements[k];
      if (slot) slot.textContent = msg;
      if (input) { input.closest(".field").classList.add("invalid"); first = first || input; }
    });
    if (first) first.focus();
  }
  function openForm(student) {
    clearErrors();
    els.form.reset();
    state.editingId = student ? student.id : null;
    els.formTitle.textContent = student ? "Edit student" : "Add student";
    els.saveBtn.textContent = student ? "Save changes" : "Save student";
    FIELDS.forEach((f) => { els.form.elements[f].value = student && student[f] != null ? student[f] : ""; });
    els.detailDialog.close();
    els.formDialog.showModal();
    els.form.elements.roll_number.focus();
  }

  function collect() {
    const data = {};
    FIELDS.forEach((f) => { data[f] = els.form.elements[f].value.trim(); });
    return data;
  }
  function clientValidate(d) {
    const e = {};
    const req = { roll_number: "Roll number", first_name: "First name", last_name: "Last name", email: "Email", course: "Course" };
    Object.entries(req).forEach(([k, l]) => { if (!d[k]) e[k] = `${l} is required.`; });
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e.email = "Enter a valid email address.";
    if (d.year && !(Number.isInteger(+d.year) && +d.year >= 1 && +d.year <= 8)) e.year = "Year must be a number from 1 to 8.";
    return e;
  }

  els.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    clearErrors();
    const data = collect();
    const errs = clientValidate(data);
    if (Object.keys(errs).length) return showErrors(errs);
    const editing = state.editingId != null;
    els.saveBtn.disabled = true;
    try {
      await api(editing ? "/" + state.editingId : "", { method: editing ? "PUT" : "POST", body: JSON.stringify(data) });
      els.formDialog.close();
      toast(editing ? "Changes saved." : "Student added.");
      await load();
    } catch (e) {
      if (e.fields) showErrors(e.fields);
      else { els.formError.textContent = e.message; els.formError.hidden = false; }
    } finally { els.saveBtn.disabled = false; }
  });

  // ----- Delete -----
  let pendingDelete = null;
  function askDelete(student) {
    pendingDelete = student;
    els.confirmText.textContent = `${student.first_name} ${student.last_name} (${student.roll_number}) will be removed permanently. This can't be undone.`;
    els.detailDialog.close();
    els.confirmDialog.showModal();
  }
  $("#confirmDelete").addEventListener("click", async () => {
    if (!pendingDelete) return;
    const s = pendingDelete;
    try {
      await api("/" + s.id, { method: "DELETE" });
      toast("Student deleted.");
    } catch (e) { toast(e.message, true); }
    pendingDelete = null;
    els.confirmDialog.close();
    load();
  });

  // ----- Events -----
  els.addBtn.addEventListener("click", () => openForm(null));
  document.addEventListener("click", (ev) => {
    const close = ev.target.closest("[data-close]");
    if (close) return close.closest("dialog").close();
    const btn = ev.target.closest("[data-action]");
    if (btn) {
      ev.stopPropagation();
      const a = btn.dataset.action;
      if (a === "add") return openForm(null);
      const s = find(btn.dataset.id);
      if (!s) return;
      return a === "edit" ? openForm(s) : askDelete(s);
    }
    const tr = ev.target.closest("tr.row");
    if (tr) showDetails(tr.dataset.id);
  });
  els.rows.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("tr.row")) { ev.preventDefault(); showDetails(ev.target.dataset.id); }
  });
  $("#detailEdit").addEventListener("click", () => state.current && openForm(state.current));
  $("#detailDelete").addEventListener("click", () => state.current && askDelete(state.current));

  let t;
  els.search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = els.search.value.trim(); load(); }, 200); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; load(); });
  els.orderBtn.addEventListener("click", () => {
    state.order = state.order === "asc" ? "desc" : "asc";
    els.orderBtn.textContent = state.order === "asc" ? "Ascending" : "Descending";
    load();
  });
  // Close dialogs when clicking the backdrop
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("mousedown", (ev) => { if (ev.target === d) d.close(); }));

  load();
})();
