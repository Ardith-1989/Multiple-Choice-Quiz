/* =========================================================
   A LEVEL ANCIENT HISTORY — MULTIPLE CHOICE QUIZ ENGINE
   Cleaned & Organised Version (Part 1/3)
   ========================================================= */

/* =========================================================
   THEME TOGGLE
   ========================================================= */
const THEME_KEY = "revision-theme";

function applyStoredTheme() {
  const t = localStorage.getItem(THEME_KEY);
  if (!t || t === "light") {
    document.body.classList.add("theme-light");
  } else {
    document.body.classList.remove("theme-light");
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains("theme-light");
  if (isLight) {
    document.body.classList.remove("theme-light");
    localStorage.setItem(THEME_KEY, "dark");
  } else {
    document.body.classList.add("theme-light");
    localStorage.setItem(THEME_KEY, "light");
  }
}

applyStoredTheme();

const themeBtn = document.getElementById("toggleThemeBtn");
if (themeBtn) themeBtn.addEventListener("click", toggleTheme);


/* =========================================================
   SIDEBAR OPEN/CLOSE
   ========================================================= */
const sidebarEl = document.getElementById("optionsSidebar");
const sidebarBackdropEl = document.getElementById("sidebarBackdrop");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");

function openSidebar() {
  sidebarEl.classList.add("open");
  sidebarBackdropEl.style.display = "block";
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  sidebarBackdropEl.style.display = "none";
}

if (openSidebarBtn) openSidebarBtn.addEventListener("click", openSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebar);
if (sidebarBackdropEl) sidebarBackdropEl.addEventListener("click", closeSidebar);


/* =========================================================
   SUPABASE INITIALISATION
   ========================================================= */
const SUPABASE_URL = "https://bzthteamkdbseartltsv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dGh0ZWFta2Ric2VhcnRsdHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjQ1MTksImV4cCI6MjA3OTMwMDUxOX0.ojZY5BKxa3ERTJsG-pieY64y6iOh3I4iJFPBJ5R1nCk";

let supabaseClient = null;
let currentUser = null;

if (window.supabase) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}


/* =========================================================
   GUEST STORAGE SYSTEM
   ========================================================= */
const GUEST_RESULTS_KEY = "mcqGuestResults";
const GUEST_IMPORTED_KEY = "mcqGuestResultsImported";

function loadsGuest() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_RESULTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveGuest(all) {
  localStorage.setItem(GUEST_RESULTS_KEY, JSON.stringify(all));
}

function guestImported() {
  return localStorage.getItem(GUEST_IMPORTED_KEY) === "true";
}

function markGuestImported() {
  localStorage.setItem(GUEST_IMPORTED_KEY, "true");
}

function getQuizId(quizMeta) {
  return quizMeta.id || quizMeta.path;
}


// Update guest result after finishing a quiz
function updateGuest(quizMeta, score, total) {
  const id = getQuizId(quizMeta);
  const all = loadsGuest();
  const prev = all[id];

  const percent = total ? Math.round((score / total) * 100) : 0;
  const attempts = prev ? prev.attempts + 1 : 1;

  const isBetter =
    !prev ||
    percent > prev.bestPercent ||
    (percent === prev.bestPercent && score > prev.bestScore);

  const updated = {
    attempts,
    lastScore: score,
    lastTotal: total,
    lastPercent: percent,
    bestScore: isBetter ? score : prev?.bestScore ?? score,
    bestTotal: isBetter ? total : prev?.bestTotal ?? total,
    bestPercent: isBetter ? percent : prev?.bestPercent ?? percent,
  };

  all[id] = updated;
  saveGuest(all);
  return updated;
}

function loadGuestQuizStats(quizMeta) {
  const id = getQuizId(quizMeta);
  const all = loadsGuest();
  return all[id] || null;
}


/* =========================================================
   SUPABASE QUIZ STATS STORAGE
   ========================================================= */
async function saveAttemptToSupabase(quizMeta, score, total) {
  if (!supabaseClient || !currentUser) return null;

  const id = getQuizId(quizMeta);
  const percent = total ? Math.round((score / total) * 100) : 0;

  const { error } = await supabaseClient.from("quiz_attempts").insert({
    quiz_id: id,
    user_id: currentUser.id,
    score,
    total,
    percent,
  });

  if (error) {
    console.warn("Supabase insert failed:", error.message);
    return null;
  }

  // Retrieve updated stats
  const { data, error: readErr } = await supabaseClient
    .from("quiz_attempts")
    .select("score, total, percent")
    .eq("quiz_id", id)
    .eq("user_id", currentUser.id);

  if (readErr || !data) return null;

  let bestPercent = -1,
    bestScore = -1,
    bestTotal = 0;
  for (const row of data) {
    if (
      row.percent > bestPercent ||
      (row.percent === bestPercent && row.score > bestScore)
    ) {
      bestPercent = row.percent;
      bestScore = row.score;
      bestTotal = row.total;
    }
  }

  return {
    attempts: data.length,
    bestPercent,
    bestScore,
    bestTotal,
  };
}


// Fetch quiz stats for logged-in user
async function fetchStatsFromSupabase(quizMeta) {
  if (!supabaseClient || !currentUser) return null;
  const id = getQuizId(quizMeta);

  const { data, error } = await supabaseClient
    .from("quiz_attempts")
    .select("score, total, percent")
    .eq("quiz_id", id)
    .eq("user_id", currentUser.id);

  if (error || !data?.length) return null;

  let bestPercent = -1,
    bestScore = -1,
    bestTotal = 0;
  for (const row of data) {
    if (
      row.percent > bestPercent ||
      (row.percent === bestPercent && row.score > bestScore)
    ) {
      bestPercent = row.percent;
      bestScore = row.score;
      bestTotal = row.total;
    }
  }

  return {
    attempts: data.length,
    bestPercent,
    bestScore,
    bestTotal,
  };
}


/* =========================================================
   STATS CACHING
   ========================================================= */
const statsCache = {};

// Decide whether to load stats from guest or Supabase
async function getQuizStats(meta) {
  const key = getQuizId(meta);
  if (statsCache[key]) return statsCache[key];

  let result;
  if (currentUser) result = await fetchStatsFromSupabase(meta);
  else result = loadGuestQuizStats(meta);

  statsCache[key] = result;
  return result;
}


// Store an attempt (guest or logged-in)
async function saveAttempt(meta, score, total) {
  let result;
  if (currentUser) result = await saveAttemptToSupabase(meta, score, total);
  else result = updateGuest(meta, score, total);

  statsCache[getQuizId(meta)] = result;
  return result;
}


/* =========================================================
   GUEST → ACCOUNT IMPORT
   ========================================================= */
async function importGuestToSupabase() {
  if (!supabaseClient || !currentUser) return;

  const all = loadsGuest();
  const rows = Object.entries(all)
    .filter(([_, s]) => s && s.bestScore != null)
    .map(([quiz_id, s]) => ({
      user_id: currentUser.id,
      quiz_id,
      score: s.bestScore,
      total: s.bestTotal,
      percent: s.bestPercent,
    }));

  if (!rows.length) {
    alert("No guest progress to import.");
    return;
  }

  const { error } = await supabaseClient.from("quiz_attempts").insert(rows);
  if (error) {
    alert("Import failed.");
    return;
  }

  markGuestImported();
  alert("Guest progress imported successfully!");
}


/* =========================================================
   SUPABASE AUTH UI
   ========================================================= */
async function refreshAuthUI() {
  const panel = document.getElementById("auth-panel");
  if (!panel) return;

  if (!supabaseClient) {
    panel.innerHTML = `<p>Guest mode only – Supabase not configured.</p>`;
    return;
  }

  // ----------------------
  // NOT LOGGED IN (GUEST)
  // ----------------------
  if (!currentUser) {
    panel.innerHTML = `
      <p><strong>Guest Mode:</strong> progress saved only on this device.</p>
      <input id="auth-email" class="sidebar-input" type="email" placeholder="Email">
      <input id="auth-password" class="sidebar-input" type="password" placeholder="Password">
      <button class="primary-button" id="login-btn">Log in</button>
      <button class="secondary-button" id="signup-btn">Create account</button>
    `;

    const getCreds = () => {
      const email = document.getElementById("auth-email").value.trim();
      const password = document.getElementById("auth-password").value;
      if (!email || !password) {
        alert("Enter email & password.");
        return null;
      }
      return { email, password };
    };

    document.getElementById("login-btn").addEventListener("click", async () => {
      const creds = getCreds();
      if (!creds) return;

      const { data, error } = await supabaseClient.auth.signInWithPassword(
        creds
      );
      if (error) return alert(error.message);

      currentUser = data.user;
      refreshAuthUI();
    });

    document.getElementById("signup-btn").addEventListener("click", async () => {
      const creds = getCreds();
      if (!creds) return;

      const { data, error } = await supabaseClient.auth.signUp(creds);
      if (error) return alert(error.message);

      alert("Account created. Check email if verification required.");
      currentUser = data.user ?? null;
      refreshAuthUI();
    });

    return;
  }

  // ----------------------
  // LOGGED IN
  // ----------------------
  const hasGuest = Object.keys(loadsGuest()).length > 0;

  panel.innerHTML = `
    <p>Logged in as <strong>${currentUser.email}</strong></p>
    ${
      hasGuest && !guestImported()
        ? `<button class="primary-button" id="import-guest-btn">Import guest progress</button>`
        : ""
    }
    <button class="secondary-button" id="logout-btn">Log out</button>
  `;

  if (hasGuest && !guestImported()) {
    document
      .getElementById("import-guest-btn")
      .addEventListener("click", importGuestToSupabase);
  }

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    currentUser = null;
    refreshAuthUI();
  });
}


// Initialise auth on load
async function initAuth() {
  if (!supabaseClient) return refreshAuthUI();

  const { data } = await supabaseClient.auth.getUser();
  currentUser = data.user ?? null;
  refreshAuthUI();

  supabaseClient.auth.onAuthStateChange((_evt, session) => {
    currentUser = session?.user ?? null;
    refreshAuthUI();
  });
}


/* =========================================================
   MASTERY CALCULATIONS
   ========================================================= */

// NOTE: “Needs Work”, “Developing”, “Strong” labels removed on request.
// Colour only.

function masteryCategory(percent) {
  if (percent >= 70) return "bad-high";
  if (percent >= 40) return "bad-mid";
  return "bad-low";
}

async function calcUnitMastery(unit) {
  const quizzes = unit.quizzes || [];
  if (!quizzes.length) return { percent: null, attempted: 0, total: 0 };

  let totalPercent = 0,
    attempted = 0;

  for (const q of quizzes) {
    const stats = await getQuizStats(q);
    if (stats && stats.attempts > 0) attempted++;
    totalPercent += stats?.bestPercent ?? 0;
  }

  const avg = Math.round(totalPercent / quizzes.length);
  return { percent: avg, attempted, total: quizzes.length };
}

async function calcModuleMastery(module) {
  const units = module.units || [];
  if (!units.length) return { percent: null, attempted: 0, total: 0 };

  let totalPercent = 0,
    totalAttempted = 0,
    total = 0;

  for (const u of units) {
    const m = await calcUnitMastery(u);
    totalPercent += m.percent ?? 0;
    totalAttempted += m.attempted;
    total += m.total;
  }

  const avg = Math.round(totalPercent / units.length);
  return { percent: avg, attempted: totalAttempted, total };
}


/* =========================================================
   RANDOM QUIZ HELPERS
   ========================================================= */

function quizzesInUnit(unit) {
  return unit.quizzes || [];
}

function quizzesInModule(module) {
  let out = [];
  for (const u of module.units || []) {
    out = out.concat(quizzesInUnit(u));
  }
  return out;
}

function randomFrom(list) {
  if (!list.length) return null;
  const i = Math.floor(Math.random() * list.length);
  return list[i];
}

// Find which unit a quiz belongs to within a module
function findUnitForQuiz(module, quizMeta) {
  const id = getQuizId(quizMeta);
  for (const u of module.units || []) {
    for (const q of u.quizzes || []) {
      if (getQuizId(q) === id) return u;
    }
  }
  return null;
}

/* -------------------------
   GLOBAL STATE
   ------------------------- */
let modules = [];
let currentModule = null;
let currentUnit = null;
let currentQuizMeta = null;
let currentQuizData = null;

let currentQuestionIndex = 0;
let selectedOptionIndex = null;
let score = 0;
const answers = [];

let shuffleQuestionsEnabled = false;
let hideFeedbackEnabled = false;
let questionOrder = [];
let currentOptionOrder = [];

// remembers where the user came from before starting a quiz
// view: "modules" | "units" | "quizzes"
let lastView = {
  view: "modules",
  moduleId: null,
  unitId: null,
};


/* -------------------------
   DOM REFERENCES
   ------------------------- */
const quizContentEl = document.getElementById("quiz-content");
const cardTitleEl = document.getElementById("card-title");
const pillRightEl = document.getElementById("pill-right");
const progressContainerEl = document.getElementById("progress-container");
const progressFillEl = document.getElementById("progress-fill");
const breadcrumbsEl = document.getElementById("breadcrumbs");


/* -------------------------
   UTILS
   ------------------------- */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


/* =========================================================
   LOAD MODULES FROM modules.json
   ========================================================= */
async function loadModules() {
  try {
    const res = await fetch("modules.json");
    if (!res.ok) throw new Error("Failed to load modules.json");
    modules = await res.json();
    renderModuleList();
  } catch (err) {
    console.error(err);
    cardTitleEl.textContent = "A Level Ancient History – Multiple Choice Quizzes";
    pillRightEl.textContent = "Error loading modules";
    progressContainerEl.style.display = "none";
    breadcrumbsEl.textContent = "";
    quizContentEl.innerHTML = `
      <p class="error-text">Could not load <code>modules.json</code>.</p>
      <p class="helper-text">
        Make sure <strong>modules.json</strong> is in the same folder as
        <strong>index.html</strong> and that you're running this via a local web
        server (not opening the file directly).
      </p>
    `;
  }
}


/* =========================================================
   BREADCRUMBS
   ========================================================= */
function setBreadcrumbs(level) {
  const bits = [];

  // Modules root
  bits.push(`<span data-level="modules">Modules</span>`);

  // Module level
  if (currentModule && level !== "modules") {
    bits.push("›");
    bits.push(`<span data-level="units">${currentModule.name}</span>`);
  }

  // Unit level
  if (currentUnit && (level === "quizzes" || level === "quiz")) {
    bits.push("›");
    bits.push(`<span data-level="quizzes">${currentUnit.name}</span>`);
  }

  // Quiz title
  if (currentQuizMeta && level === "quiz") {
    bits.push("›");
    bits.push(`<span>${currentQuizMeta.title}</span>`);
  }

  breadcrumbsEl.innerHTML = bits.join(" ");

  // Clickable crumbs
  breadcrumbsEl
    .querySelectorAll("span[data-level]")
    .forEach((el) => {
      el.addEventListener("click", () => {
        const lvl = el.getAttribute("data-level");
        if (lvl === "modules") {
          renderModuleList();
        } else if (lvl === "units" && currentModule) {
          renderUnitList(currentModule.id);
        } else if (lvl === "quizzes" && currentModule && currentUnit) {
          renderQuizList(currentUnit.id);
        }
      });
    });
}


/* =========================================================
   MODULE LIST
   ========================================================= */
function renderModuleList() {
  currentModule = null;
  currentUnit = null;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];
  lastView = { view: "modules", moduleId: null, unitId: null };

  cardTitleEl.textContent =
    "A Level Ancient History – Multiple Choice Quizzes";
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0%";
  setBreadcrumbs("modules");

  if (!modules.length) {
    pillRightEl.textContent = "0 modules";
    quizContentEl.innerHTML = `
      <p>No modules found in <code>modules.json</code>.</p>
      <p class="helper-text">
        Add modules, units and quizzes to the JSON file to see them listed here.
      </p>
    `;
    return;
  }

  pillRightEl.textContent =
    modules.length === 1 ? "1 module" : `${modules.length} modules`;

  quizContentEl.innerHTML = `
    <div class="list">
      ${modules
        .map(
          (m) => `
        <div class="list-item" data-module-id="${m.id}">
          <div style="display:flex; width:100%; align-items:center;">
            <div style="flex:1;">
              <div class="list-title">${m.name}</div>
              <div class="list-meta">
                <span>${m.units?.length || 0} unit${
            (m.units?.length || 0) !== 1 ? "s" : ""
          }</span>
                <span class="mastery-text" data-master-module="${m.id}"></span>
                ${m.description ? `<span>• ${m.description}</span>` : ""}
              </div>
            </div>
            <button class="random-btn" data-random-module="${m.id}">
              Random quiz
            </button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
    <p class="helper-text">
      Select a module to view its units and quizzes. Edit
      <strong>modules.json</strong> to organise your content.
    </p>
  `;

  // Click on a module card -> Unit list
  quizContentEl
    .querySelectorAll(".list-item[data-module-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const modId = card.getAttribute("data-module-id");
        renderUnitList(modId);
      });
    });

  // Random quiz per module
  quizContentEl
    .querySelectorAll("[data-random-module]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const moduleId = btn.getAttribute("data-random-module");
        const mod = modules.find((m) => m.id === moduleId);
        if (!mod) return;

        const allQuizzes = quizzesInModule(mod);
        const chosen = randomFrom(allQuizzes);
        if (!chosen) {
          alert("This module has no quizzes.");
          return;
        }

        // Try to infer which unit this quiz belongs to
        const u = findUnitForQuiz(mod, chosen);
        currentModule = mod;
        currentUnit = u || null;

        lastView = {
          view: "modules",
          moduleId: mod.id,
          unitId: u ? u.id : null,
        };

        startQuiz(chosen);
      });
    });

  // Mastery for each module
  modules.forEach(async (m) => {
    const el = quizContentEl.querySelector(
      `.mastery-text[data-master-module="${m.id}"]`
    );
    if (!el) return;

    const result = await calcModuleMastery(m);
    if (!result || !result.total || result.percent == null) {
      el.textContent = "";
      return;
    }

    const cls = masteryCategory(result.percent);
    el.innerHTML = `
      • <span class="mastery-tooltip">
          <span class="mastery-badge ${cls}">
            Mastery: ${result.percent}%
          </span>
          <span class="tooltip-text">
            This represents your average best score across all quizzes in this module.
            Unattempted quizzes count as 0% until you try them.
          </span>
        </span>
        <span>• ${result.attempted}/${result.total} quizzes attempted</span>
    `;
  });
}


/* =========================================================
   UNIT LIST (WITH RANDOM QUIZ PER UNIT)
   ========================================================= */
function renderUnitList(moduleId) {
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) return;

  currentModule = mod;
  currentUnit = null;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];
  lastView = { view: "units", moduleId: mod.id, unitId: null };

  cardTitleEl.textContent = mod.name;
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0%";
  setBreadcrumbs("units");

  const units = mod.units || [];
  pillRightEl.textContent =
    units.length === 1 ? "1 unit" : `${units.length} units`;

  if (!units.length) {
    quizContentEl.innerHTML = `
      <p>No units found for this module.</p>
      <div class="controls" style="justify-content:flex-start;">
        <button class="secondary-button" id="back-modules">Back to modules</button>
      </div>
    `;
    document
      .getElementById("back-modules")
      .addEventListener("click", renderModuleList);
    return;
  }

  quizContentEl.innerHTML = `
    <div class="list">
      ${units
        .map(
          (u) => `
        <div class="list-item" data-unit-id="${u.id}">
          <div style="display:flex; width:100%; align-items:center;">
            <div style="flex:1;">
              <div class="list-title">${u.name}</div>
              <div class="list-meta">
                <span>${u.quizzes?.length || 0} quiz${
            (u.quizzes?.length || 0) !== 1 ? "zes" : ""
          }</span>
                <span class="mastery-text" data-master-unit="${u.id}"></span>
                ${u.description ? `<span>• ${u.description}</span>` : ""}
              </div>
            </div>
            <button class="random-btn" data-random-unit="${u.id}">
              Random quiz
            </button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="controls" style="justify-content:flex-start;">
      <button class="secondary-button" id="back-modules">Back to modules</button>
    </div>
  `;

  // Click on a unit card -> Quiz list
  quizContentEl
    .querySelectorAll(".list-item[data-unit-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const unitId = card.getAttribute("data-unit-id");
        renderQuizList(unitId);
      });
    });

  // Back to modules
  document
    .getElementById("back-modules")
    .addEventListener("click", renderModuleList);

  // Random quiz per unit
  quizContentEl
    .querySelectorAll("[data-random-unit]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const unitId = btn.getAttribute("data-random-unit");
        const unit = (currentModule.units || []).find((u) => u.id === unitId);
        if (!unit) return;

        const qList = quizzesInUnit(unit);
        const chosen = randomFrom(qList);
        if (!chosen) {
          alert("This unit has no quizzes.");
          return;
        }

        currentUnit = unit;
        lastView = { view: "units", moduleId: currentModule.id, unitId: unit.id };
        startQuiz(chosen);
      });
    });

  // Mastery per unit
  units.forEach(async (u) => {
    const el = quizContentEl.querySelector(
      `.mastery-text[data-master-unit="${u.id}"]`
    );
    if (!el) return;

    const result = await calcUnitMastery(u);
    if (!result || !result.total || result.percent == null) {
      el.textContent = "";
      return;
    }

    const cls = masteryCategory(result.percent);
    el.innerHTML = `
      • <span class="mastery-tooltip">
          <span class="mastery-badge ${cls}">
            Mastery: ${result.percent}%
          </span>
          <span class="tooltip-text">
            This represents your average best score across all quizzes in this unit.
            Unattempted quizzes count as 0% until you try them.
          </span>
        </span>
        <span>• ${result.attempted}/${result.total} quizzes attempted</span>
    `;
  });
}


/* =========================================================
   QUIZ LIST WITHIN A UNIT
   ========================================================= */
function renderQuizList(unitId) {
  if (!currentModule) return;
  const unit = (currentModule.units || []).find((u) => u.id === unitId);
  if (!unit) return;

  currentUnit = unit;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];
  lastView = { view: "quizzes", moduleId: currentModule.id, unitId: unit.id };

  cardTitleEl.textContent = unit.name;
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0%";
  setBreadcrumbs("quizzes");

  const quizzes = unit.quizzes || [];
  pillRightEl.textContent =
    quizzes.length === 1 ? "1 quiz" : `${quizzes.length} quizzes`;

  if (!quizzes.length) {
    quizContentEl.innerHTML = `
      <p>No quizzes found for this unit.</p>
      <div class="controls" style="justify-content:flex-start;">
        <button class="secondary-button" id="back-units">Back to units</button>
      </div>
    `;
    document
      .getElementById("back-units")
      .addEventListener("click", () => renderUnitList(currentModule.id));
    return;
  }

  quizContentEl.innerHTML = `
    <div class="list">
      ${quizzes
        .map(
          (q) => `
        <button class="list-item" data-quiz-id="${q.id}">
          <div class="list-title">${q.title}</div>
          <div class="list-meta" data-stats-for="${q.id}">
            <span>${
              currentUser
                ? "Loading stats…"
                : "Guest: progress saved on this device"
            }</span>
          </div>
        </button>
      `
        )
        .join("")}
    </div>
    <div class="controls" style="justify-content:flex-start;">
      <button class="secondary-button" id="back-units">Back to units</button>
    </div>
  `;

  // Click quiz -> start quiz
  quizContentEl
    .querySelectorAll(".list-item[data-quiz-id]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-quiz-id");
        const meta = (currentUnit.quizzes || []).find((q) => q.id === id);
        if (!meta) return;

        lastView = {
          view: "quizzes",
          moduleId: currentModule.id,
          unitId: currentUnit.id,
        };
        startQuiz(meta);
      });
    });

  // Back to units
  document
    .getElementById("back-units")
    .addEventListener("click", () => renderUnitList(currentModule.id));

  // Populate quiz stats
  quizzes.forEach(async (q) => {
    const el = quizContentEl.querySelector(
      `.list-meta[data-stats-for="${q.id}"]`
    );
    if (!el) return;

    const stats = await getQuizStats(q);
    if (!stats || !stats.attempts) {
      el.innerHTML = `<span>${
        currentUser ? "Not attempted yet" : "Guest: not attempted yet"
      }</span>`;
      return;
    }

    el.innerHTML = `
      <span>Attempts: ${stats.attempts}</span>
      <span>•</span>
      <span>Best: ${stats.bestScore}/${stats.bestTotal} (${stats.bestPercent}%)</span>
    `;
  });
}

/* =========================================================
   PART 3 — QUIZ ENGINE, QUESTION VIEW, RESULTS, INIT
   ========================================================= */


/* =========================================================
   EXIT QUIZ (RESPECTING lastView)
   ========================================================= */
function exitQuiz() {
  // If for some reason lastView is not configured, go home
  if (!lastView) {
    renderModuleList();
    return;
  }

  const { view, moduleId, unitId } = lastView;

  if (view === "quizzes" && moduleId && unitId) {
    renderQuizList(unitId);
    return;
  }

  if (view === "units" && moduleId) {
    renderUnitList(moduleId);
    return;
  }

  renderModuleList();
}


/* =========================================================
   START QUIZ
   ========================================================= */
async function startQuiz(meta) {
  currentQuizMeta = meta;
  currentQuizData = null;
  currentQuestionIndex = 0;
  selectedOptionIndex = null;
  score = 0;
  answers.length = 0;

  cardTitleEl.textContent = meta.title;
  setBreadcrumbs("quiz");

  // Load JSON
  try {
    const res = await fetch(meta.path);
    if (!res.ok) {
      throw new Error(`Could not load quiz file: ${meta.path}`);
    }
    currentQuizData = await res.json();
  } catch (err) {
    console.error(err);
    quizContentEl.innerHTML = `
      <p class="error-text">
        Could not load <code>${meta.path}</code>. Check filename and JSON validity.
      </p>
      <div class="controls" style="justify-content:flex-start;">
        <button class="secondary-button" id="back-quizzes">Exit quiz</button>
      </div>
    `;
    document
      .getElementById("back-quizzes")
      .addEventListener("click", exitQuiz);
    return;
  }

  // Build question order
  questionOrder = currentQuizData.questions.map((_, i) => i);
  if (shuffleQuestionsEnabled) shuffleArray(questionOrder);

  renderQuestion();
}


/* =========================================================
   RENDER A QUESTION
   ========================================================= */
function renderQuestion() {
  const total = currentQuizData.questions.length;
  const qi = questionOrder[currentQuestionIndex];
  const q = currentQuizData.questions[qi];

  progressContainerEl.style.display = "block";
  const pct = ((currentQuestionIndex + 1) / total) * 100;
  progressFillEl.style.width = pct + "%";

  // Shuffle options
  const count = q.options.length;
  currentOptionOrder = [...Array(count).keys()];
  shuffleArray(currentOptionOrder);

  const optsHtml = currentOptionOrder
    .map(
      (optIndex, ii) => `
    <button class="option-btn" data-opt="${ii}">
      ${q.options[optIndex]}
    </button>
  `
    )
    .join("");

  pillRightEl.textContent = `Question ${currentQuestionIndex + 1} of ${total}`;

  quizContentEl.innerHTML = `
    <div class="question-block">
      <p class="question-text">${q.question}</p>
      <div class="option-block">${optsHtml}</div>

      <div class="nav-controls">
        ${
          currentQuestionIndex + 1 < total
            ? `<button class="primary-button" id="next-btn" disabled>Next</button>`
            : `<button class="primary-button" id="finish-btn" disabled>Finish</button>`
        }
      </div>

      <div id="feedback"></div>
    </div>
  `;

  // Option click
  quizContentEl
    .querySelectorAll(".option-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (selectedOptionIndex != null) return;

        const chosenIndex = parseInt(btn.getAttribute("data-opt"), 10);
        selectedOptionIndex = chosenIndex;

        const optRealIndex = currentOptionOrder[chosenIndex];
        const correctRealIndex = q.answer;

        const isCorrect = optRealIndex === correctRealIndex;
        if (isCorrect) score++;

        answers.push({
          questionIndex: qi,
          correct: isCorrect,
        });

        if (!hideFeedbackEnabled) {
          const fb = document.getElementById("feedback");
          fb.textContent = isCorrect
            ? "Correct!"
            : `Incorrect. Correct answer: ${q.options[correctRealIndex]}`;
          fb.classList.add(isCorrect ? "correct" : "incorrect");
        }

        btn.classList.add(isCorrect ? "correct" : "incorrect");

        const nextBtn = document.getElementById("next-btn");
        const finishBtn = document.getElementById("finish-btn");
        if (nextBtn) nextBtn.disabled = false;
        if (finishBtn) finishBtn.disabled = false;
      });
    });

  // Next
  const nextBtn = document.getElementById("next-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      selectedOptionIndex = null;
      currentQuestionIndex++;
      renderQuestion();
    });
  }

  // Finish
  const finishBtn = document.getElementById("finish-btn");
  if (finishBtn) {
    finishBtn.addEventListener("click", () => {
      renderResult();
    });
  }
}


/* =========================================================
   RENDER RESULT SCREEN
   ========================================================= */
async function renderResult() {
  const total = currentQuizData.questions.length;
  const percent = Math.round((score / total) * 100);

  // Save attempt (guest or logged-in)
  const updatedStats = await saveAttempt(currentQuizMeta, score, total);

  // Summary list
  const summaryHtml = answers
    .map((a, i) => {
      const q = currentQuizData.questions[a.questionIndex];
      const isCorrect = a.correct ? "correct" : "incorrect";
      return `
        <div class="summary-item ${isCorrect}">
          <strong>Q${i + 1}:</strong> ${a.correct ? "Correct" : "Incorrect"} 
          <span class="summary-question">${q.question}</span>
        </div>
      `;
    })
    .join("");

  quizContentEl.innerHTML = `
    <div class="result-heading">Your results for "${currentQuizMeta.title}"</div>
    <p class="result-score">
      You scored <strong>${score}</strong> out of <strong>${total}</strong>
      (${percent}%)
    </p>

    ${
      updatedStats
        ? `<p class="result-detail">
             Attempts: ${updatedStats.attempts} • 
             Best: ${updatedStats.bestScore}/${updatedStats.bestTotal} 
             (${updatedStats.bestPercent}%)
           </p>`
        : `<p class="result-detail">Progress saved.</p>`
    }

    <div class="controls" style="margin-bottom: 6px; flex-wrap:wrap;">
      <button class="secondary-button" id="exit-btn">Exit quiz</button>
      <button class="secondary-button" id="next-quiz-btn">Next quiz in unit</button>
      <button class="secondary-button" id="random-unit-quiz-btn">Random quiz in unit</button>
      <button class="primary-button" id="retake-btn">Retake this quiz</button>
    </div>

    <div class="summary-list">${summaryHtml}</div>
  `;

  // Exit
  document.getElementById("exit-btn").addEventListener("click", exitQuiz);

  // Retake same quiz
  document.getElementById("retake-btn").addEventListener("click", () => {
    startQuiz(currentQuizMeta);
  });

  /* -----------------------------------------
     NEXT QUIZ IN UNIT
     ----------------------------------------- */
  const nextBtn = document.getElementById("next-quiz-btn");
  const rndBtn = document.getElementById("random-unit-quiz-btn");

  const unit = currentUnit;
  const mod = currentModule;

  if (!unit || !unit.quizzes || unit.quizzes.length === 0) {
    nextBtn.disabled = true;
    rndBtn.disabled = true;
  } else {
    nextBtn.addEventListener("click", () => {
      const quizzes = unit.quizzes;
      const currentId = getQuizId(currentQuizMeta);
      const idx = quizzes.findIndex((q) => getQuizId(q) === currentId);

      if (idx === -1 || idx === quizzes.length - 1) {
        alert("There is no next quiz in this unit.");
        return;
      }

      const nextMeta = quizzes[idx + 1];
      lastView = { view: "quizzes", moduleId: mod.id, unitId: unit.id };
      startQuiz(nextMeta);
    });

    /* -----------------------------------------
       RANDOM QUIZ IN UNIT
       ----------------------------------------- */
    rndBtn.addEventListener("click", () => {
      const quizzes = unit.quizzes;
      const currentId = getQuizId(currentQuizMeta);

      const pool = quizzes.filter((q) => getQuizId(q) !== currentId);
      const chosen = pool.length ? randomFrom(pool) : randomFrom(quizzes);

      if (!chosen) {
        alert("This unit has no quizzes.");
        return;
      }

      lastView = { view: "quizzes", moduleId: mod.id, unitId: unit.id };
      startQuiz(chosen);
    });
  }
}


/* =========================================================
   SIDEBAR OPTIONS (SHUFFLE / HIDE FEEDBACK)
   ========================================================= */
document.getElementById("shuffleToggle").addEventListener("change", (e) => {
  shuffleQuestionsEnabled = e.target.checked;
});

document.getElementById("hideCorrectToggle").addEventListener("change", (e) => {
  hideFeedbackEnabled = e.target.checked;
});


/* =========================================================
   INITIALISATION
   ========================================================= */
initAuth();
loadModules();
