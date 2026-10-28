
"use strict";

const KEY = "attendly_data_v2";
const $ = id => document.getElementById(id);

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { students: [], att: {}, threshold: 75 };

    const d = JSON.parse(raw);

    if (!Array.isArray(d.students) || !d.att ||
        typeof d.att !== "object") {
      throw new Error("Invalid data");
    }

    return {
      students: d.students,
      att: d.att,
      threshold: Math.max(0, Math.min(100, Number(d.threshold) || 75))
    };
  } catch {
    return { students: [], att: {}, threshold: 75 };
  }
}

let S = load();
let editing = null;
let toastTimer;

$("date").value = today();
$("thr").value = S.threshold;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    toast("Unable to save data.");
  }
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").style.display = "block";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").style.display = "none";
  }, 2500);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function stats(id) {
  let p = 0;
  let a = 0;

  for (const date in S.att) {
    const status = S.att[date]?.[id];

    if (status === "Present" || status === "Late") p++;
    if (status === "Absent") a++;
  }

  return {
    p,
    a,
    pct: p + a ? 100 * p / (p + a) : null
  };
}

function setStatus(id, date, status) {
  if (!S.students.some(s => s.id === id)) return;

  const day = S.att[date] || (S.att[date] = {});

  if (day[id] === status) {
    delete day[id];

    if (!Object.keys(day).length) {
      delete S.att[date];
    }

    toast("Attendance cleared");
  } else {
    day[id] = status;
    toast("Marked " + status);
  }

  save();
  render();

  if ($("hd").open) {
    renderHistory($("hd").dataset.id);
  }
}

function render() {
  const date = $("date").value || today();
  const q = $("q").value.trim().toLowerCase();
  const dept = $("dept").value;
  const filter = $("st").value;

  const threshold = $("thr").value === ""
    ? S.threshold
    : Number($("thr").value);

  const day = S.att[date] || {};

  const departments = [...new Set(
    S.students.map(s => s.dept)
  )].sort();

  $("dept").innerHTML =
    '<option value="">All departments</option>' +
    departments.map(d =>
      `<option value="${esc(d)}">${esc(d)}</option>`
    ).join("");

  $("dept").value = dept;

  $("dl").innerHTML = departments.map(d =>
    `<option value="${esc(d)}"></option>`
  ).join("");

  const students = S.students.filter(s => {
    const status = day[s.id];
    const pct = stats(s.id).pct;

    if (q &&
        !s.name.toLowerCase().includes(q) &&
        !s.id.toLowerCase().includes(q)) return false;

    if (dept && s.dept !== dept) return false;
    if (filter === "_un") return !status;

    if (filter === "_low") {
      return pct !== null && pct < threshold;
    }

    if (filter) return status === filter;
    return true;
  });

  let present = 0;
  let absent = 0;
  let totalP = 0;
  let totalA = 0;
  let low = 0;

  S.students.forEach(s => {
    if (day[s.id] === "Present" || day[s.id] === "Late") present++;
    if (day[s.id] === "Absent") absent++;

    const t = stats(s.id);
    totalP += t.p;
    totalA += t.a;

    if (t.pct !== null && t.pct < threshold) low++;
  });

  const overall = totalP + totalA
    ? (100 * totalP / (totalP + totalA)).toFixed(1) + "%"
    : "—";

  const cards = [
    ["Total students", S.students.length, "Enrolled"],
    ["Present", present, "Including late"],
    ["Absent", absent, "Selected date"],
    ["Overall attendance", overall, "All records"],
    ["Low attendance", low, `Below ${threshold}%`]
  ];

  $("cards").innerHTML = cards.map(c => `
    <div class="card">
      <div class="label">${esc(c[0])}</div>
      <div class="value">${esc(c[1])}</div>
      <div class="note">${esc(c[2])}</div>
    </div>
  `).join("");

  $("rows").innerHTML = students.map(s => {
    const status = day[s.id] || "";
    const t = stats(s.id);
    const pct = t.pct === null ? "—" : t.pct.toFixed(1) + "%";
    const isLow = t.pct !== null && t.pct < threshold;

    const buttons = ["Present", "Absent", "Late", "Excused"]
      .map(st => `
        <button class="${status === st ? "on " : ""}${st}"
          aria-pressed="${status === st}"
          data-id="${esc(s.id)}"
          data-status="${st}">${st}</button>
      `).join("");

    return `
      <tr class="${isLow ? "low" : ""}">
        <td>${esc(s.id)}</td>
        <td>${esc(s.name)}
          ${isLow ? '<div class="badge">Below threshold</div>' : ""}
        </td>
        <td>${esc(s.dept)}</td>
        <td>
          <div class="statuses">${buttons}</div>
          ${status ? "" : '<span class="muted">Unmarked</span>'}
        </td>
        <td>${pct}</td>
        <td>
          <button class="small-btn" data-action="edit"
            data-id="${esc(s.id)}">Edit</button>
          <button class="small-btn" data-action="history"
            data-id="${esc(s.id)}">History</button>
          <button class="small-btn" data-action="delete"
            data-id="${esc(s.id)}">Delete</button>
        </td>
      </tr>`;
  }).join("");

  $("empty").hidden = students.length > 0;
}

function openStudent(student = null) {
  editing = student ? student.id : null;

  $("sdt").textContent = student ? "Edit student" : "Add student";
  $("fid").value = student?.id || "";
  $("fname").value = student?.name || "";
  $("fdept").value = student?.dept || "";

  $("sd").showModal();
}

$("add").addEventListener("click", () => openStudent());
$("sc").addEventListener("click", () => $("sd").close());

$("sf").addEventListener("submit", e => {
  e.preventDefault();

  const id = $("fid").value.trim();
  const name = $("fname").value.trim();
  const dept = $("fdept").value.trim();

  const duplicate = S.students.some(s =>
    s.id.toLowerCase() === id.toLowerCase() &&
    s.id !== editing
  );

  if (duplicate) {
    toast("Student ID already exists");
    return;
  }

  const wasEditing = editing !== null;

  if (wasEditing) {
    const student = S.students.find(s => s.id === editing);
    if (!student) return;

    if (id !== editing) {
      for (const date in S.att) {
        if (Object.hasOwn(S.att[date], editing)) {
          S.att[date][id] = S.att[date][editing];
          delete S.att[date][editing];
        }
      }
    }

    Object.assign(student, { id, name, dept });
  } else {
    S.students.push({ id, name, dept });
  }

  editing = null;
  save();
  $("sd").close();
  render();
  toast(wasEditing ? "Student updated" : "Student added");
});

$("rows").addEventListener("click", e => {
  const button = e.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;
  const status = button.dataset.status;

  if (status) {
    setStatus(id, $("date").value, status);
    return;
  }

  switch (button.dataset.action) {
    case "edit":
      openStudent(S.students.find(s => s.id === id));
      break;
    case "history":
      showHistory(id);
      break;
    case "delete":
      deleteStudent(id);
      break;
  }
});

function deleteStudent(id) {
  const student = S.students.find(s => s.id === id);
  if (!student) return;

  if (!confirm(`Delete ${student.name} and their attendance records?`))
    return;

  S.students = S.students.filter(s => s.id !== id);

  for (const date in S.att) {
    delete S.att[date][id];

    if (!Object.keys(S.att[date]).length) {
      delete S.att[date];
    }
  }

  save();
  render();
  toast("Student deleted");
}

function showHistory(id) {
  $("hd").dataset.id = id;
  renderHistory(id);
  $("hd").showModal();
}

function renderHistory(id) {
  const student = S.students.find(s => s.id === id);
  if (!student) return;

  const t = stats(id);

  $("hs").textContent =
    `${student.name} | Present/Late: ${t.p} | Absent: ${t.a} | ` +
    `Attendance: ${t.pct === null ? "—" : t.pct.toFixed(1) + "%"}`;

  const entries = Object.entries(S.att)
    .filter(([date, records]) => records[id])
    .sort(([a], [b]) => b.localeCompare(a));

  $("hl").innerHTML = entries.length
    ? entries.map(([date, records]) => `
        <div class="history-item">
          <strong>${esc(date)}</strong> — ${esc(records[id])}
        </div>
      `).join("")
    : '<p class="muted">No attendance records yet.</p>';
}

$("hc").addEventListener("click", () => $("hd").close());

$("allp").addEventListener("click", () => {
  const date = $("date").value;
  const q = $("q").value.trim().toLowerCase();
  const dept = $("dept").value;
  const filter = $("st").value;

  if (filter && filter !== "_un") {
    toast("Choose All or Unmarked to use this action");
    return;
  }

  const day = S.att[date] || (S.att[date] = {});
  let count = 0;

  S.students.forEach(s => {
    if (q &&
        !s.name.toLowerCase().includes(q) &&
        !s.id.toLowerCase().includes(q)) return;

    if (dept && s.dept !== dept) return;

    if (!day[s.id]) {
      day[s.id] = "Present";
      count++;
    }
  });

  if (!Object.keys(day).length) delete S.att[date];

  save();
  render();
  toast(`${count} student(s) marked present`);
});

["date", "dept", "st"].forEach(id =>
  $(id).addEventListener("change", render)
);

$("q").addEventListener("input", render);

$("thr").addEventListener("change", () => {
  const n = Number($("thr").value);

  if ($("thr").value.trim() === "" || !Number.isFinite(n)) {
    $("thr").value = S.threshold;
    return;
  }

  S.threshold = Math.max(0, Math.min(100, n));
  $("thr").value = S.threshold;
  save();
  render();
});

$("theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";

  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("theme").textContent = dark ? "☀️ Light" : "🌙 Dark";

  try {
    localStorage.setItem("attendly_theme", dark ? "dark" : "light");
  } catch {}
});

try {
  const theme = localStorage.getItem("attendly_theme");

  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
    $("theme").textContent =
      theme === "dark" ? "☀️ Light" : "🌙 Dark";
  }
} catch {}

render();
    
