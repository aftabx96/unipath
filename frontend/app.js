/* ============================================================
   UniPath — frontend logic
   Works against the Flask backend (http://127.0.0.1:5000).
   If the backend is offline, it falls back to the bundled
   dataset (universities-data.js) so the UI still works.
   ============================================================ */

const API_BASE = "http://127.0.0.1:5000";

const state = {
  universities: [],
  tiers: [],
  online: false,
  query: "",
  shortlist: new Set(),   // keys
  tracked: new Set(),     // keys
  compare: [],            // keys (ordered, max 4)
};

const LS = {
  theme: "unipath.theme",
  shortlist: "unipath.shortlist",
  tracked: "unipath.tracked",
  compare: "unipath.compare",
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const keyOf = (u) => `${u.name}__${u.city}`;

const money = (v) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Number(v || 0));

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || payload.message || "Request failed");
  return payload;
}

/* ---------------- persistence ---------------- */
function loadStore() {
  try { state.shortlist = new Set(JSON.parse(localStorage.getItem(LS.shortlist) || "[]")); } catch {}
  try { state.tracked = new Set(JSON.parse(localStorage.getItem(LS.tracked) || "[]")); } catch {}
  try { state.compare = JSON.parse(localStorage.getItem(LS.compare) || "[]"); } catch {}
}
const saveShortlist = () => localStorage.setItem(LS.shortlist, JSON.stringify([...state.shortlist]));
const saveTracked = () => localStorage.setItem(LS.tracked, JSON.stringify([...state.tracked]));
const saveCompare = () => localStorage.setItem(LS.compare, JSON.stringify(state.compare));

/* ---------------- theme ---------------- */
function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem(LS.theme, name);
  $$("#swatches .swatch").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.themeVal === name))
  );
}
function setupTheme() {
  const saved = localStorage.getItem(LS.theme) || "light";
  applyTheme(saved);
  $("#swatches").addEventListener("click", (e) => {
    const btn = e.target.closest(".swatch");
    if (!btn) return;
    applyTheme(btn.dataset.themeVal);
    showToast(`${btn.title} theme applied`);
  });
}

/* ---------------- deadlines ---------------- */
function deadlineInfo(dateStr) {
  if (!dateStr) return { label: "No deadline", cls: "dl-past", days: Infinity };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  const days = Math.round((d - today) / 86400000);
  if (isNaN(days)) return { label: "No deadline", cls: "dl-past", days: Infinity };
  if (days < 0) return { label: "Closed", cls: "dl-past", days };
  if (days === 0) return { label: "Closes today", cls: "dl-urgent", days };
  if (days <= 7) return { label: `${days} day${days > 1 ? "s" : ""} left`, cls: "dl-urgent", days };
  if (days <= 30) return { label: `${days} days left`, cls: "dl-soon", days };
  return { label: `${days} days left`, cls: "dl-ok", days };
}

/* ---------------- select helpers ---------------- */
function fillSelect(select, values, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((v) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    select.appendChild(o);
  });
}
function fillUniversitySelect(select) {
  select.innerHTML = "";
  [...state.universities]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((u) => {
      const o = document.createElement("option");
      o.value = u.name;
      o.textContent = state.universities.filter((x) => x.name === u.name).length > 1
        ? `${u.name} — ${u.city}` : u.name;
      o.dataset.key = keyOf(u);
      select.appendChild(o);
    });
}
function getPrograms() {
  const set = new Set();
  state.universities.forEach((u) =>
    String(u.programs || "").split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
  );
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ---------------- university card ---------------- */
function universityCard(u, opts = {}) {
  const key = keyOf(u);
  const website = String(u.website || "").replace(/^https?:\/\//, "");
  const href = website ? `https://${website}` : "#";
  const dl = deadlineInfo(u.deadline);
  const starred = state.shortlist.has(key);
  const tracked = state.tracked.has(key);
  const inCompare = state.compare.includes(key);

  return `
    <article class="uni-card" data-key="${key}">
      <header>
        <div>
          <h3>${u.name}</h3>
          <span class="muted">${u.city}, ${u.province || "Pakistan"}</span>
        </div>
        <span class="pill">${u.tier || `Rank ${u.hec_rank}`}</span>
      </header>
      <div class="programs">${u.programs || "Programs not listed"}</div>
      <div class="metric-row">
        <div class="metric"><small>Merit</small><strong>${u.min_merit}%–${u.max_merit}%</strong></div>
        <div class="metric"><small>Fee / semester</small><strong>${money(u.fee_per_year)}</strong></div>
        <div class="metric"><small>HEC Rank</small><strong>${u.hec_rank}</strong></div>
        <div class="metric"><small>Hostel</small><strong>${u.hostel || "N/A"}</strong></div>
      </div>
      <div class="uni-footer">
        <span class="dl-tag ${dl.cls}">${dl.label}</span>
        <div class="card-actions">
          <button class="icon-btn ${tracked ? "on" : ""}" data-act="track" data-key="${key}" title="Track deadline" aria-label="Track deadline">
            <svg viewBox="0 0 24 24" fill="${tracked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>
          </button>
          <button class="icon-btn ${inCompare ? "on" : ""}" data-act="compare" data-key="${key}" title="Add to compare" aria-label="Add to compare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
          </button>
          <button class="icon-btn ${starred ? "on" : ""}" data-act="star" data-key="${key}" title="Save to shortlist" aria-label="Save to shortlist">
            <svg viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
          ${website ? `<a class="icon-btn" href="${href}" target="_blank" rel="noreferrer" title="Website" aria-label="Website"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14L21 3M15 3h6v6M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg></a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function findByKey(key) {
  return state.universities.find((u) => keyOf(u) === key);
}

/* ---------------- card action handling (event delegation) ---------------- */
function handleCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const key = btn.dataset.key;
  const act = btn.dataset.act;
  const u = findByKey(key);
  if (!u) return;

  if (act === "star") {
    if (state.shortlist.has(key)) { state.shortlist.delete(key); showToast("Removed from shortlist"); }
    else { state.shortlist.add(key); showToast("Saved to shortlist"); }
    saveShortlist();
  } else if (act === "track") {
    if (state.tracked.has(key)) { state.tracked.delete(key); showToast("Deadline untracked"); }
    else { state.tracked.add(key); showToast("Deadline tracked"); }
    saveTracked();
  } else if (act === "compare") {
    if (state.compare.includes(key)) { state.compare = state.compare.filter((k) => k !== key); showToast("Removed from compare"); }
    else if (state.compare.length >= 4) { showToast("Compare holds up to 4"); return; }
    else { state.compare.push(key); showToast("Added to compare"); }
    saveCompare();
  }
  refreshBadges();
  rerenderAll();
}

/* ---------------- renderers ---------------- */
function renderOverview() {
  const u = state.universities;
  if (!u.length) return;
  const fees = u.map((x) => Number(x.fee_per_year || 0));
  $("#totalUniversities").textContent = u.length;
  $("#totalCities").textContent = new Set(u.map((x) => x.city)).size;
  $("#averageFee").textContent = money(fees.reduce((a, b) => a + b, 0) / fees.length);
  const minIdx = fees.indexOf(Math.min(...fees));
  $("#lowestFee").textContent = u[minIdx] ? u[minIdx].name : money(Math.min(...fees));

  const featured = [...u].sort((a, b) => Number(a.hec_rank) - Number(b.hec_rank)).slice(0, 6);
  $("#featuredGrid").innerHTML = featured.map((x) => universityCard(x)).join("");
}

function applySearch(items) {
  const q = state.query.toLowerCase().trim();
  if (!q) return items;
  return items.filter((u) =>
    [u.name, u.city, u.province, u.programs, u.tier].join(" ").toLowerCase().includes(q)
  );
}

function renderExplorer() {
  const city = $("#cityFilter").value;
  const province = $("#provinceFilter").value;
  const program = $("#programFilter").value;
  const sort = $("#sortFilter").value;

  let items = [...state.universities];
  if (city) items = items.filter((u) => u.city === city);
  if (province) items = items.filter((u) => u.province === province);
  if (program) items = items.filter((u) => String(u.programs || "").toLowerCase().includes(program.toLowerCase()));
  items = applySearch(items);

  const sorters = {
    rank: (a, b) => Number(a.hec_rank) - Number(b.hec_rank),
    fee: (a, b) => Number(a.fee_per_year) - Number(b.fee_per_year),
    merit: (a, b) => Number(a.min_merit) - Number(b.min_merit),
    deadline: (a, b) => deadlineInfo(a.deadline).days - deadlineInfo(b.deadline).days,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  items.sort(sorters[sort] || sorters.rank);

  $("#universityGrid").innerHTML = items.length
    ? items.map((u) => universityCard(u)).join("")
    : `<div class="empty">No universities match the current filters.</div>`;
}

function renderDeadlines() {
  const scope = $("#deadlineScope").value;
  let items = [...state.universities];
  if (scope === "tracked") items = items.filter((u) => state.tracked.has(keyOf(u)));
  items = items
    .map((u) => ({ u, dl: deadlineInfo(u.deadline) }))
    .filter((x) => scope === "tracked" ? true : x.dl.days >= 0)
    .sort((a, b) => a.dl.days - b.dl.days);

  if (!items.length) {
    $("#deadlineList").innerHTML = `<div class="empty">${
      scope === "tracked"
        ? "No tracked deadlines yet. Tap the clock icon on any university card to track it."
        : "No upcoming deadlines."
    }</div>`;
    return;
  }
  $("#deadlineList").innerHTML = `<div class="university-grid">${
    items.map(({ u, dl }) => `
      <article class="uni-card" data-key="${keyOf(u)}">
        <header>
          <div><h3>${u.name}</h3><span class="muted">${u.city}, ${u.province}</span></div>
          <span class="dl-tag ${dl.cls}">${dl.label}</span>
        </header>
        <div class="metric-row">
          <div class="metric"><small>Deadline</small><strong>${u.deadline || "N/A"}</strong></div>
          <div class="metric"><small>Merit</small><strong>${u.min_merit}%–${u.max_merit}%</strong></div>
        </div>
        <div class="uni-footer">
          <span>Fee/sem ${money(u.fee_per_year)}</span>
          <div class="card-actions">
            <button class="icon-btn ${state.tracked.has(keyOf(u)) ? "on" : ""}" data-act="track" data-key="${keyOf(u)}" title="Track deadline">
              <svg viewBox="0 0 24 24" fill="${state.tracked.has(keyOf(u)) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>
            </button>
          </div>
        </div>
      </article>`).join("")
  }</div>`;
}

function renderShortlist() {
  const items = state.universities.filter((u) => state.shortlist.has(keyOf(u)));
  $("#shortlistGrid").innerHTML = items.length
    ? items.map((u) => universityCard(u)).join("")
    : `<div class="empty">Your shortlist is empty. Tap the bookmark icon on any card to save it here.</div>`;
}

function renderCompare() {
  const items = state.compare.map(findByKey).filter(Boolean);
  if (!items.length) {
    $("#compareArea").innerHTML = `<div class="empty">No universities to compare yet. Tap the compare icon on up to 4 cards.</div>`;
    return;
  }
  const rows = [
    ["City", (u) => `${u.city}, ${u.province}`],
    ["Programs", (u) => u.programs || "—"],
    ["Merit range", (u) => `${u.min_merit}% – ${u.max_merit}%`],
    ["Fee / semester", (u) => money(u.fee_per_year)],
    ["HEC rank", (u) => u.hec_rank],
    ["Hostel", (u) => u.hostel || "—"],
    ["Tier", (u) => u.tier || "—"],
    ["Deadline", (u) => `${u.deadline || "—"} (${deadlineInfo(u.deadline).label})`],
  ];
  $("#compareArea").innerHTML = `
    <div class="compare-wrap"><table class="compare">
      <thead><tr><th>Field</th>${items.map((u) => `<th>${u.name}<br><button class="remove-col" data-act="compare" data-key="${keyOf(u)}">remove</button></th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(([label, fn]) => `<tr><th>${label}</th>${items.map((u) => `<td>${fn(u)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table></div>`;
}

function computeTiersFallback() {
  const sorted = [...state.universities].sort((a, b) => Number(a.fee_per_year) - Number(b.fee_per_year));
  const n = sorted.length, t = Math.ceil(n / 3);
  const buckets = { Budget: sorted.slice(0, t), "Mid-Range": sorted.slice(t, 2 * t), Premium: sorted.slice(2 * t) };
  return Object.entries(buckets).map(([tier, unis]) => ({
    tier, count: unis.length,
    universities: unis.map((u) => ({ name: u.name, city: u.city, fee_per_year: u.fee_per_year, hec_rank: u.hec_rank, tier })),
  }));
}

function renderTiers() {
  const tiers = state.tiers.length ? state.tiers : computeTiersFallback();
  $("#tierGrid").innerHTML = tiers.map((tier) => `
    <article class="tier-column">
      <div class="tier-head"><h3>${tier.tier}</h3><span class="muted">${tier.count} unis</span></div>
      <div class="tier-list">
        ${tier.universities.map((u) => `
          <div class="tier-item"><strong>${u.name}</strong><small>${u.city} · ${money(u.fee_per_year)} · Rank ${u.hec_rank}</small></div>
        `).join("")}
      </div>
    </article>`).join("");
}

function refreshBadges() {
  const set = (id, n) => {
    const el = $(id);
    el.textContent = n;
    el.hidden = !n;
  };
  set("#shortlistBadge", state.shortlist.size);
  set("#compareBadge", state.compare.length);
  set("#deadlineBadge", state.tracked.size);
}

function rerenderAll() {
  renderOverview();
  renderExplorer();
  renderDeadlines();
  renderShortlist();
  renderCompare();
  renderTiers();
}

/* ---------------- navigation + mobile ---------------- */
function setView(view) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === view));
  window.location.hash = view;
  closeMenu();
}
function openMenu() { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); }
function closeMenu() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }

function setupNavigation() {
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#menuToggle").addEventListener("click", openMenu);
  $("#scrim").addEventListener("click", closeMenu);
  const initial = window.location.hash.replace("#", "");
  if (initial && $(`.nav-item[data-view="${initial}"]`)) setView(initial);
}

/* ---------------- forms ---------------- */
function recommendFallback({ merit, budget, city, program }) {
  let items = state.universities.filter(
    (u) => Number(u.min_merit) <= Number(merit) && Number(u.fee_per_year) <= Number(budget)
  );
  if (city) items = items.filter((u) => u.city.toLowerCase() === String(city).toLowerCase());
  if (program) items = items.filter((u) => String(u.programs || "").toLowerCase().includes(String(program).toLowerCase()));
  return items.sort((a, b) => Number(a.hec_rank) - Number(b.hec_rank));
}

function predictFallback(merit, uniName) {
  const u = state.universities.find((x) => x.name.toLowerCase() === uniName.toLowerCase());
  if (!u) throw new Error("University not found.");
  const min = +u.min_merit, max = +u.max_merit, mid = (min + max) / 2;
  let chance, percent;
  if (merit >= max - 2) [chance, percent] = ["Very High", 90];
  else if (merit >= mid) [chance, percent] = ["Good", 70];
  else if (merit >= min) [chance, percent] = ["Moderate", 45];
  else [chance, percent] = ["Low", 15];
  return {
    university: u.name, student_merit: merit, required_merit: `${min}% – ${max}%`,
    chance, percent, tier: u.tier || "—", dt_confidence: "—",
    message: `Local estimate: your chance at ${u.name} is ${chance} (${percent}%) based on the ${min}%–${max}% merit range.`,
  };
}

function renderPrediction(r) {
  $("#predictionCard").innerHTML = `
    <div class="prediction-score">
      <div class="score-top">
        <div class="score-circle" style="--score:${r.percent}%"><span>${r.percent}%</span></div>
        <div><h3>${r.chance}</h3><p class="muted">${r.message}</p></div>
      </div>
      <div class="metric-row">
        <div class="metric"><small>Required merit</small><strong>${r.required_merit}</strong></div>
        <div class="metric"><small>Model confidence</small><strong>${r.dt_confidence}${r.dt_confidence !== "—" ? "%" : ""}</strong></div>
        <div class="metric"><small>Tier</small><strong>${r.tier}</strong></div>
        <div class="metric"><small>Your merit</small><strong>${r.student_merit}%</strong></div>
      </div>
    </div>`;
}

function setupForms() {
  $("#recommendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    $("#recommendMessage").textContent = "Finding matches…";
    $("#recommendResults").innerHTML = "";
    try {
      let items;
      if (state.online) {
        const r = await api("/recommend", { method: "POST", body: JSON.stringify(data) });
        items = r.results || [];
      } else {
        items = recommendFallback(data);
      }
      $("#recommendMessage").textContent = items.length ? `${items.length} match${items.length > 1 ? "es" : ""} found.` : "No universities match your criteria. Try raising your budget or merit.";
      $("#recommendResults").innerHTML = items.map((u) => universityCard(u)).join("");
    } catch (err) { $("#recommendMessage").textContent = err.message; }
  });

  $("#predictForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    $("#predictionCard").innerHTML = `<span class="muted">Calculating…</span>`;
    try {
      const r = state.online
        ? await api("/predict", { method: "POST", body: JSON.stringify(data) })
        : predictFallback(Number(data.merit), data.university);
      renderPrediction(r);
    } catch (err) { $("#predictionCard").innerHTML = `<span class="muted">${err.message}</span>`; }
  });

  $("#similarForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    $("#similarMessage").textContent = "Finding similar universities…";
    $("#similarResults").innerHTML = "";
    try {
      let items, query = data.university;
      if (state.online) {
        const r = await api("/similar", { method: "POST", body: JSON.stringify(data) });
        items = r.similar || []; query = r.query;
      } else {
        const base = state.universities.find((u) => u.name.toLowerCase() === data.university.toLowerCase());
        items = base ? [...state.universities]
          .filter((u) => keyOf(u) !== keyOf(base))
          .map((u) => ({ ...u, d: Math.abs(u.fee_per_year - base.fee_per_year) / 1e5 + Math.abs(u.hec_rank - base.hec_rank) / 10 + Math.abs(u.min_merit - base.min_merit) / 20 }))
          .sort((a, b) => a.d - b.d).slice(0, 3) : [];
      }
      $("#similarMessage").textContent = items.length ? `Universities most similar to ${query}.` : "No similar universities found.";
      $("#similarResults").innerHTML = items.map((u) => universityCard(u)).join("");
    } catch (err) { $("#similarMessage").textContent = err.message; }
  });

  $("#chatForm").addEventListener("submit", onChatSubmit);
  $("#chatSuggest").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $("#chatForm").elements.message.value = chip.textContent;
    $("#chatForm").requestSubmit();
  });

  $("#exportShortlist").addEventListener("click", exportShortlist);
  $("#clearCompare").addEventListener("click", () => { state.compare = []; saveCompare(); refreshBadges(); rerenderAll(); });
}

/* ---------------- chat ---------------- */
function addMessage(text, type) {
  const m = document.createElement("div");
  m.className = `message ${type}`;
  m.textContent = text;
  $("#chatMessages").appendChild(m);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
  return m;
}

async function onChatSubmit(e) {
  e.preventDefault();
  const input = e.currentTarget.elements.message;
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, "user");
  input.value = "";
  const pending = addMessage("Thinking…", "bot");
  try {
    if (state.online) {
      const r = await api("/chat", { method: "POST", body: JSON.stringify({ message }) });
      pending.textContent = r.reply || localAnswer(message);
    } else {
      pending.textContent = localAnswer(message);
    }
  } catch (err) {
    pending.textContent = localAnswer(message);
  }
}

/* Local keyword-based fallback so chat always responds. */
function localAnswer(qRaw) {
  const q = qRaw.toLowerCase();
  const u = state.universities;
  const byFee = [...u].sort((a, b) => a.fee_per_year - b.fee_per_year);
  const fmtList = (arr) => arr.slice(0, 5).map((x) => `• ${x.name} (${x.city}) — ${money(x.fee_per_year)}, merit ${x.min_merit}–${x.max_merit}%`).join("\n");

  // budget: "under 100000"
  const budgetMatch = q.match(/(\d[\d,]{3,})/);
  const cities = [...new Set(u.map((x) => x.city.toLowerCase()))];
  const city = cities.find((c) => q.includes(c));
  const progMap = { cs: "CS", "computer": "CS", ai: "AI", business: "Business", medicine: "Medicine", engineering: "Engineering", law: "Law", pharmacy: "Pharmacy" };
  const progKey = Object.keys(progMap).find((k) => q.includes(k));
  const prog = progKey ? progMap[progKey] : null;

  if (q.includes("deadline") || q.includes("closing") || q.includes("soon")) {
    const soon = u.map((x) => ({ x, dl: deadlineInfo(x.deadline) })).filter((o) => o.dl.days >= 0).sort((a, b) => a.dl.days - b.dl.days).slice(0, 5);
    return "Deadlines closing soonest:\n" + soon.map((o) => `• ${o.x.name} (${o.x.city}) — ${o.x.deadline} · ${o.dl.label}`).join("\n");
  }

  let pool = [...u];
  if (city) pool = pool.filter((x) => x.city.toLowerCase() === city);
  if (prog) pool = pool.filter((x) => String(x.programs).toLowerCase().includes(prog.toLowerCase()));
  if (budgetMatch) {
    const b = Number(budgetMatch[1].replace(/,/g, ""));
    if (b > 1000) pool = pool.filter((x) => x.fee_per_year <= b);
  }

  if (q.includes("cheap") || q.includes("affordable") || q.includes("lowest fee")) {
    const base = (city || prog || budgetMatch) ? pool : byFee;
    return `Most affordable${prog ? " " + prog : ""}${city ? " in " + city : ""} options:\n` + fmtList([...base].sort((a, b) => a.fee_per_year - b.fee_per_year));
  }

  if (city || prog || budgetMatch) {
    if (!pool.length) return "I couldn't find universities matching that in the database. Try a different city, program, or budget.";
    return `Here are matching universities:\n` + fmtList(pool.sort((a, b) => a.hec_rank - b.hec_rank));
  }

  if (q.includes("how many") || q.includes("total")) {
    return `The database has ${u.length} universities across ${new Set(u.map((x) => x.city)).size} cities and ${new Set(u.map((x) => x.province)).size} provinces/regions.`;
  }

  return "I can help with university recommendations from the database. Try: 'cheapest CS universities', 'universities in Lahore under 100000', or 'which deadlines are closing soon?'";
}

/* ---------------- export ---------------- */
function exportShortlist() {
  const items = state.universities.filter((u) => state.shortlist.has(keyOf(u)));
  if (!items.length) return showToast("Shortlist is empty");
  const cols = ["name", "city", "province", "programs", "min_merit", "max_merit", "fee_per_year", "hec_rank", "deadline", "website"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...items.map((u) => cols.map((c) => esc(u[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "unipath-shortlist.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Shortlist exported");
}

/* ---------------- filters ---------------- */
function setupFilters() {
  ["cityFilter", "provinceFilter", "programFilter", "sortFilter"].forEach((id) =>
    $(`#${id}`).addEventListener("change", renderExplorer)
  );
  $("#exploreSearch").addEventListener("input", (e) => { state.query = e.target.value; renderExplorer(); });
  $("#deadlineScope").addEventListener("change", renderDeadlines);
  document.body.addEventListener("click", handleCardAction);
}

/* ---------------- boot ---------------- */
function setChatMode() {
  $("#chatMode").textContent = state.online ? "AI · Groq" : "Offline · local answers";
}

async function boot() {
  loadStore();
  setupTheme();
  setupNavigation();
  setupForms();
  setupFilters();

  // Try backend; fall back to bundled data.
  try {
    await api("/");
    state.online = true;
    const [universities, tiers] = await Promise.all([api("/universities"), api("/tiers")]);
    state.universities = universities;
    state.tiers = tiers;
  } catch {
    state.online = false;
    state.universities = (window.UNIVERSITY_DATA || []).map((u) => ({
      ...u,
      min_merit: +u.min_merit, max_merit: +u.max_merit,
      fee_per_year: +u.fee_per_year, hec_rank: +u.hec_rank,
    }));
    showToast("Backend offline — showing bundled data. Start Flask for AI tools.");
  }

  // populate selects
  const cities = [...new Set(state.universities.map((u) => u.city))].sort((a, b) => a.localeCompare(b));
  const provinces = [...new Set(state.universities.map((u) => u.province))].sort((a, b) => a.localeCompare(b));
  const programs = getPrograms();
  fillSelect($("#cityFilter"), cities, "All cities");
  fillSelect($("#provinceFilter"), provinces, "All provinces");
  fillSelect($("#programFilter"), programs, "All programs");
  fillSelect($("#recommendCity"), cities, "Any city");
  fillSelect($("#recommendProgram"), programs, "Any program");
  fillUniversitySelect($("#predictUniversity"));
  fillUniversitySelect($("#similarUniversity"));

  setChatMode();
  refreshBadges();
  rerenderAll();
}

boot();
