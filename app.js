/* =========================================================
   A LEVEL ANCIENT HISTORY — MULTIPLE CHOICE QUIZ ENGINE
   CLEAN VERSION — PART 1/3
   ========================================================= */

/* ============================
   THEME TOGGLE
   ============================ */
const THEME_KEY = "revision-theme";

function applyStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (!stored || stored === "light") {
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
if (themeBtn) {
  themeBtn.addEventListener("click", toggleTheme);
}

/* ============================
   SIDEBAR OPEN/CLOSE
   ============================ */
const sidebarEl = document.getElementById("optionsSidebar");
const sidebarBackdropEl = document.getElementById("sidebarBackdrop");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");

function openSidebar() {
  sidebarEl.classList.add("open");
  if (sidebarBackdropEl) sidebarBackdropEl.style.display = "block";
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  if (sidebarBackdropEl) sidebarBackdropEl.style.display = "none";
}

if (openSidebarBtn) openSidebarBtn.addEventListener("click", openSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebar);
if (sidebarBackdropEl) sidebarBackdropEl.addEventListener("click", closeSidebar);

/* ============================
   SUPABASE INITIALISATION
   ============================ */
const SUPABASE_URL = "https://bzthteamkdbseartltsv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dGh0ZWFta2Ric2VhcnRsdHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjQ1MTksImV4cCI6MjA3OTMwMDUxOX0.ojZY5BKxa3ERTJsG-pieY64y6iOh3I4iJFPBJ5R1nCk";

let supabaseClient = null;
let currentUser = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

/* ============================
   GUEST STORAGE
   ============================ */
const GUEST_RESULTS_KEY = "mcqGuestResults";
const GUEST_IMPORTED_KEY = "mcqGuestResultsImported";

function getQuizIdFromMeta(quizMeta) {
  return quizMeta && quizMeta.id ? quizMeta.id : quizMeta.path;
}

function loadGuestAll() {
  try {
    const raw = localStorage.getItem(GUEST_RESULTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGuestAll(all) {
  try {
    localStorage.setItem(GUEST_RESULTS_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("Failed to save guest results", e);
  }
}

function hasGuestBeenImported() {
  return localStorage.getItem(GUEST_IMPORTED_KEY) === "true";
}

function markGuestImported() {
  localStorage.setItem(GUEST_IMPORTED_KEY, "true");
}

function updateGuestQuizResults(quizMeta, score, total) {
  const quizId = getQuizIdFromMeta(quizMeta);
  const all = loadGuestAll();
  const prev = all[quizId];

  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const attempts = prev ? prev.attempts + 1 : 1;

  const isBest =
    !prev ||
    percent > prev.bestPercent ||
    (percent === prev.bestPercent && score > prev.bestScore);

  const updated = {
    attempts,
    lastScore: score,
    lastTotal: total,
    lastPercent: percent,
    lastCompletedAt: new Date().toISOString(),
    bestScore: isBest ? score : prev?.bestScore ?? score,
    bestTotal: isBest ? total : prev?.bestTotal ?? total,
    bestPercent: isBest ? percent : prev?.bestPercent ?? percent,
  };

  all[quizId] = updated;
  saveGuestAll(all);
  return updated;
}

function getGuestQuizStats(quizMeta) {
  const quizId = getQuizIdFromMeta(quizMeta);
  const all = loadGuestAll();
  return all[quizId] || null;
}

/* ============================
   SUPABASE QUIZ STATS
   ============================ */
async function saveAttemptToSupabase(quizMeta, score, total) {
  if (!supabaseClient || !currentUser) return null;

  const quizId = getQuizIdFromMeta(quizMeta);
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  // Insert this attempt
  const { error } = await supabaseClient.from("quiz_attempts").insert({
    user_id: currentUser.id,
    quiz_id: quizId,
    score,
    total,
    percent,
  });

  if (error) {
    console.error("Failed to save quiz attempt:", error.message);
    return null;
  }

  // Fetch all attempts for updated stats
  const { data, error: statsError } = await supabaseClient
    .from("quiz_attempts")
    .select("score, total, percent")
    .eq("user_id", currentUser.id)
    .eq("quiz_id", quizId);

  if (statsError || !data) {
    console.error("Failed to fetch updated stats:", statsError?.message);
    return null;
  }

  const attempts = data.length;
  let bestScore = -1;
  let bestTotal = 0;
  let bestPercent = -1;

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
    attempts,
    bestScore,
    bestTotal,
    bestPercent,
  };
}

async function fetchQuizStatsFromSupabase(quizMeta) {
  if (!supabaseClient || !currentUser) return null;

  const quizId = getQuizIdFromMeta(quizMeta);

  const { data, error } = await supabaseClient
    .from("quiz_attempts")
    .select("score, total, percent")
    .eq("user_id", currentUser.id)
    .eq("quiz_id", quizId);

  if (error || !data) {
    console.error("Failed to fetch stats:", error?.message);
    return null;
  }

  if (data.length === 0) {
    return {
      attempts: 0,
      bestScore: null,
      bestTotal: null,
      bestPercent: null,
    };
  }

  const attempts = data.length;
  let bestScore = -1;
  let bestTotal = 0;
  let bestPercent = -1;

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
    attempts,
    bestScore,
    bestTotal,
    bestPercent,
  };
}

/* ============================
   STATS CACHE + DISPATCH
   ============================ */
const quizStatsCache = {};

async function saveAttempt(quizMeta, score, total) {
  let result;
  if (supabaseClient && currentUser) {
    result = await saveAttemptToSupabase(quizMeta, score, total);
  } else {
    result = updateGuestQuizResults(quizMeta, score, total);
  }
  const key = getQuizIdFromMeta(quizMeta);
  quizStatsCache[key] = result;
  return result;
}

async function getQuizStats(quizMeta) {
  const key = getQuizIdFromMeta(quizMeta);
  if (quizStatsCache[key]) return quizStatsCache[key];

  let stats;
  if (supabaseClient && currentUser) {
    stats = await fetchQuizStatsFromSupabase(quizMeta);
  } else {
    stats = getGuestQuizStats(quizMeta);
  }
  quizStatsCache[key] = stats;
  return stats;
}

/* ============================
   IMPORT GUEST → SUPABASE
   ============================ */
async function importGuestResultsToSupabase() {
  if (!supabaseClient || !currentUser) return;

  const all = loadGuestAll();
  const entries = Object.entries(all);
  if (entries.length === 0) {
    alert("No guest progress found on this device.");
    return;
  }

  const rows = [];

  for (const [quizId, stats] of entries) {
    if (!stats || stats.bestScore == null || stats.bestTotal == null) continue;

    rows.push({
      user_id: currentUser.id,
      quiz_id: quizId,
      score: stats.bestScore,
      total: stats.bestTotal,
      percent:
        stats.bestPercent ??
        Math.round((stats.bestScore / stats.bestTotal) * 100),
    });
  }

  if (!rows.length) {
    alert("No usable guest progress found to import.");
    return;
  }

  const { error } = await supabaseClient.from("quiz_attempts").insert(rows);

  if (error) {
    console.error("Failed to import guest results:", error.message);
    alert("Sorry, something went wrong while importing your guest progress.");
    return;
  }

  markGuestImported();
  alert(
    "Guest progress imported into your account! Your stats will now sync across devices."
  );
}

/* ============================
   AUTH UI
   ============================ */
async function refreshAuthPanel() {
  const panel = document.getElementById("auth-panel");
  if (!panel) return;

  if (!supabaseClient) {
    panel.innerHTML = `
      <div class="sidebar-text">
        Supabase is not configured. Using guest mode only (progress stays on this device).
      </div>
    `;
    return;
  }

  // GUEST MODE
  if (!currentUser) {
    panel.innerHTML = `
      <div class="sidebar-text" style="margin-bottom:6px;">
        <strong>Guest mode:</strong> your scores are saved on this device only.
        Log in or create an account to sync progress across devices.
      </div>
      <input type="email" id="auth-email" placeholder="Email" class="sidebar-input" />
      <input type="password" id="auth-password" placeholder="Password" class="sidebar-input" />
      <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
        <button class="primary-button" id="auth-login-btn">
          Log in
        </button>
        <button class="secondary-button" id="auth-signup-btn">
          Create account
        </button>
      </div>
    `;

    const loginBtn = document.getElementById("auth-login-btn");
    const signupBtn = document.getElementById("auth-signup-btn");

    function getCreds() {
      const emailEl = document.getElementById("auth-email");
      const passEl = document.getElementById("auth-password");
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password) {
        alert("Please enter an email and password.");
        return null;
      }
      return { email, password };
    }

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        const creds = getCreds();
        if (!creds) return;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });

        if (error) {
          alert("Login failed: " + error.message);
          return;
        }

        currentUser = data.user;
        refreshAuthPanel();
      });
    }

    if (signupBtn) {
      signupBtn.addEventListener("click", async () => {
        const creds = getCreds();
        if (!creds) return;

        const { data, error } = await supabaseClient.auth.signUp({
          email: creds.email,
          password: creds.password,
        });

        if (error) {
          alert("Sign-up error: " + error.message);
          return;
        }

        alert(
          "Account created. If email confirmation is required, check your inbox, then come back and log in."
        );
        currentUser = data.user ?? null;
        refreshAuthPanel();
      });
    }

    return;
  }

  // LOGGED IN
  const guestHasData = Object.keys(loadGuestAll()).length > 0;
  const showImportPrompt = guestHasData && !hasGuestBeenImported();

  panel.innerHTML = `
    <div class="sidebar-text">
      Logged in as <strong>${currentUser.email}</strong><br />
      Your quiz results are synced via Supabase.
    </div>

    ${
      showImportPrompt
        ? `<div class="sidebar-text" style="margin-top:6px;">
             We found quiz progress saved in guest mode on this device.
             You can import it into your account so it syncs across devices.
           </div>
           <button class="primary-button" id="import-guest-btn" style="margin-top:6px;">
             Import guest progress
           </button>`
        : ""
    }

    <button class="secondary-button" id="auth-logout-btn" style="margin-top:8px;">
      Log out
    </button>
  `;

  const logoutBtn = document.getElementById("auth-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      currentUser = null;
      refreshAuthPanel();
    });
  }

  const importBtn = document.getElementById("import-guest-btn");
  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      await importGuestResultsToSupabase();
      refreshAuthPanel();
    });
  }
}

async function initAuth() {
  if (!supabaseClient) {
    currentUser = null;
    refreshAuthPanel();
    return;
  }

  const { data } = await supabaseClient.auth.getUser();
  currentUser = data.user ?? null;
  refreshAuthPanel();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    refreshAuthPanel();
  });
}

/* ============================
   MASTERY CALCULATIONS
   ============================ */

// NOTE: You asked to remove the labels ("Needs work", etc.) but keep colouring.

function getMasteryClass(percent) {
  if (percent == null || Number.isNaN(percent)) return "";
  if (percent >= 70) return "bad-high";
  if (percent >= 40) return "bad-mid";
  return "bad-low";
}

async function calculateUnitMastery(unit) {
  const quizzes = unit.quizzes || [];
  if (!quizzes.length) {
    return { percent: null, attempted: 0, total: 0 };
  }

  let sumPercent = 0;
  let attempted = 0;

  for (const q of quizzes) {
    const stats = await getQuizStats(q);
    if (stats && stats.attempts > 0) attempted++;
    sumPercent += stats?.bestPercent ?? 0;
  }

  const avg = Math.round(sumPercent / quizzes.length);
  return { percent: avg, attempted, total: quizzes.length };
}

async function calculateModuleMastery(module) {
  const units = module.units || [];
  if (!units.length) {
    return { percent: null, attempted: 0, total: 0 };
  }

  let sumPercent = 0;
  let totalAttempted = 0;
  let totalQuizzes = 0;

  for (const u of units) {
    const result = await calculateUnitMastery(u);
    sumPercent += result.percent ?? 0;
    totalAttempted += result.attempted;
    totalQuizzes += result.total;
  }

  const avg = Math.round(sumPercent / units.length);
  return { percent: avg, attempted: totalAttempted, total: totalQuizzes };
}

/* ============================
   RANDOM QUIZ HELPERS
   ============================ */
function getAllQuizzesInUnit(unit) {
  return unit.quizzes || [];
}

function getAllQuizzesInModule(module) {
  let quizzes = [];
  (module.units || []).forEach((u) => {
    if (u.quizzes) quizzes = quizzes.concat(u.quizzes);
  });
  return quizzes;
}

function pickRandomQuiz(quizzes) {
  if (!quizzes || quizzes.length === 0) return null;
  const index = Math.floor(Math.random() * quizzes.length);
  return quizzes[index];
}

// Find which unit a quiz belongs to within a module
function findUnitForQuizInModule(module, quizMeta) {
  if (!module || !module.units) return null;
  const targetId = getQuizIdFromMeta(quizMeta);
  for (const u of module.units) {
    const qs = u.quizzes || [];
    for (const q of qs) {
      if (getQuizIdFromMeta(q) === targetId) return u;
    }
  }
  return null;
}

/* ============================
   END OF PART 1
   (State, rendering, quiz engine in Parts 2 & 3)
   ============================ */
/* =========================================================
   PART 2 — STATE, NAVIGATION, MODULE / UNIT / QUIZ LISTS
   ========================================================= */

/* ============================
   GLOBAL STATE
   ============================ */
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

// remembers where we came from before starting a quiz
// view: "modules" | "units" | "quizzes"
let lastView = {
  view: "modules",
  moduleId: null,
  unitId: null,
};

/* ============================
   DOM REFERENCES
   ============================ */
const quizContentEl = document.getElementById("quiz-content");
const cardTitleEl = document.getElementById("card-title");
const pillRightEl = document.getElementById("pill-right");
const progressContainerEl = document.getElementById("progress-container");
const progressFillEl = document.getElementById("progress-fill");
const breadcrumbsEl = document.getElementById("breadcrumbs");

/* ============================
   GENERIC UTILS
   ============================ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ============================
   LOAD MODULES.JSON
   ============================ */
async function loadModules() {
  try {
    const res = await fetch("modules.json");
    if (!res.ok) throw new Error("Failed to load modules.json");
    modules = await res.json();
    renderModuleList();
  } catch (err) {
    console.error(err);
    cardTitleEl.textContent =
      "A Level Ancient History – Multiple Choice Quizzes";
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

/* ============================
   BREADCRUMBS
   ============================ */
function setBreadcrumbs(level) {
  const bits = [];

  // Root
  bits.push(`<span data-level="modules">Modules</span>`);

  // Module
  if (currentModule && level !== "modules") {
    bits.push("›");
    bits.push(`<span data-level="units">${currentModule.name}</span>`);
  }

  // Unit
  if (currentUnit && (level === "quizzes" || level === "quiz")) {
    bits.push("›");
    bits.push(`<span data-level="quizzes">${currentUnit.name}</span>`);
  }

  // Quiz
  if (currentQuizMeta && level === "quiz") {
    bits.push("›");
    bits.push(`<span>${currentQuizMeta.title}</span>`);
  }

  breadcrumbsEl.innerHTML = bits.join(" ");

  // Clickable crumb behaviour
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

/* ============================
   MODULE LIST
   ============================ */
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

  if (!modules || !modules.length) {
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
                <span class="mastery-text" data-master-for-module="${m.id}"></span>
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

  // Click module card -> unit list
  quizContentEl
    .querySelectorAll(".list-item[data-module-id]")
    .forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-module-id");
        renderUnitList(id);
      });
    });

  // Random quiz per module
  quizContentEl
    .querySelectorAll("[data-random-module]")
    .forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const moduleId = btn.getAttribute("data-random-module");
        const mod = modules.find((m) => m.id === moduleId);
        if (!mod) return;

        const quizzes = getAllQuizzesInModule(mod);
        const chosen = pickRandomQuiz(quizzes);
        if (!chosen) {
          alert("This module has no quizzes.");
          return;
        }

        // Try to locate which unit this quiz belongs to
        const unit = findUnitForQuizInModule(mod, chosen);
        currentModule = mod;
        currentUnit = unit || null;

        // lastView: module level origin
        lastView = {
          view: "modules",
          moduleId: mod.id,
          unitId: unit ? unit.id : null,
        };

        startQuiz(chosen);
      });
    });

  // Mastery for each module
  modules.forEach(async (m) => {
    const el = quizContentEl.querySelector(
      `.mastery-text[data-master-for-module="${m.id}"]`
    );
    if (!el) return;
    const result = await calculateModuleMastery(m);
    if (!result || !result.total || result.percent == null) {
      el.textContent = "";
      return;
    }
    const cls = getMasteryClass(result.percent);
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

/* ============================
   UNIT LIST (WITH RANDOM QUIZ PER UNIT)
   ============================ */
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
                <span class="mastery-text" data-master-for-unit="${u.id}"></span>
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

  // Click unit card -> quiz list
  quizContentEl
    .querySelectorAll(".list-item[data-unit-id]")
    .forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-unit-id");
        renderQuizList(id);
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
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const unitId = btn.getAttribute("data-random-unit");
        const unit = (currentModule.units || []).find((u) => u.id === unitId);
        if (!unit) return;

        const quizzes = getAllQuizzesInUnit(unit);
        const chosen = pickRandomQuiz(quizzes);
        if (!chosen) {
          alert("This unit has no quizzes.");
          return;
        }

        currentUnit = unit;
        lastView = {
          view: "units",
          moduleId: currentModule.id,
          unitId: unit.id,
        };

        startQuiz(chosen);
      });
    });

  // Mastery for each unit
  units.forEach(async (u) => {
    const el = quizContentEl.querySelector(
      `.mastery-text[data-master-for-unit="${u.id}"]`
    );
    if (!el) return;
    const result = await calculateUnitMastery(u);
    if (!result || !result.total || result.percent == null) {
      el.textContent = "";
      return;
    }
    const cls = getMasteryClass(result.percent);
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

/* ============================
   QUIZ LIST WITHIN A UNIT
   ============================ */
function renderQuizList(unitId) {
  if (!currentModule) return;
  const unit = (currentModule.units || []).find((u) => u.id === unitId);
  if (!unit) return;

  currentUnit = unit;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];
  lastView = {
    view: "quizzes",
    moduleId: currentModule.id,
    unitId: unit.id,
  };

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

  // Click quiz card -> start quiz
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

  // Populate stats
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

/* ============================
   END OF PART 2
   (Quiz engine, result screen, toggles, init in Part 3)
   ============================ */
/* =========================================================
   PART 3 — QUIZ ENGINE, RESULT SCREEN, TOGGLES, INIT
   ========================================================= */

/* ============================
   EXIT QUIZ (USES lastView)
   ============================ */
function exitQuiz() {
  if (!lastView) {
    renderModuleList();
    return;
  }

  const { view, moduleId, unitId } = lastView;

  if (view === "quizzes" && unitId) {
    renderQuizList(unitId);
    return;
  }

  if (view === "units" && moduleId) {
    renderUnitList(moduleId);
    return;
  }

  // Fallback
  renderModuleList();
}

/* ============================
   START QUIZ
   ============================ */
async function startQuiz(quizMeta) {
  currentQuizMeta = quizMeta;
  currentQuizData = null;
  currentQuestionIndex = 0;
  selectedOptionIndex = null;
  score = 0;
  answers.length = 0;
  questionOrder = [];
  currentOptionOrder = [];

  cardTitleEl.textContent = quizMeta.title || "Quiz";
  setBreadcrumbs("quiz");
  pillRightEl.textContent = "Loading quiz…";
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0%";

  quizContentEl.innerHTML = `
    <p>Loading quiz <strong>${quizMeta.title}</strong>…</p>
    <p class="helper-text">File: <code>${quizMeta.path}</code></p>
  `;

  try {
    const res = await fetch(quizMeta.path);
    if (!res.ok) throw new Error("Failed to load quiz JSON");
    const data = await res.json();
    currentQuizData = data;
  } catch (err) {
    console.error(err);
    pillRightEl.textContent = "Error loading quiz";
    progressContainerEl.style.display = "none";
    quizContentEl.innerHTML = `
      <p class="error-text">Could not load quiz file <code>${quizMeta.path}</code>.</p>
      <div class="controls" style="justify-content:flex-start;">
        <button class="secondary-button" id="back-quizzes">Exit quiz</button>
      </div>
    `;
    const backBtn = document.getElementById("back-quizzes");
    if (backBtn) backBtn.addEventListener("click", exitQuiz);
    return;
  }

  const questions = currentQuizData.questions || [];
  if (!questions.length) {
    pillRightEl.textContent = "No questions";
    progressContainerEl.style.display = "none";
    quizContentEl.innerHTML = `
      <p class="error-text">This quiz has no questions.</p>
      <div class="controls" style="justify-content:flex-start;">
        <button class="secondary-button" id="back-quizzes">Exit quiz</button>
      </div>
    `;
    const backBtn = document.getElementById("back-quizzes");
    if (backBtn) backBtn.addEventListener("click", exitQuiz);
    return;
  }

  // Build question order (0..n-1) and maybe shuffle
  questionOrder = questions.map((_, i) => i);
  if (shuffleQuestionsEnabled) shuffleArray(questionOrder);

  progressContainerEl.style.display = "block";
  renderQuestion();
}

/* ============================
   RENDER QUESTION
   ============================ */
function renderQuestion() {
  const questions = currentQuizData.questions || [];
  const total = questions.length;

  const realIndex = questionOrder[currentQuestionIndex];
  const q = questions[realIndex];

  selectedOptionIndex = null;

  // Build & shuffle option order
  currentOptionOrder = q.options.map((_, i) => i);
  shuffleArray(currentOptionOrder);

  const optionsHtml = currentOptionOrder
    .map(
      (optIdx, displayIdx) => `
      <button class="option-btn" data-index="${optIdx}">
        <span class="option-label">${String.fromCharCode(
          65 + displayIdx
        )}.</span>
        <span class="option-text">${q.options[optIdx]}</span>
      </button>
    `
    )
    .join("");

  const description =
    currentQuizData.description || "Choose the best answer for each question.";

  const questionNumber = currentQuestionIndex + 1;
  const progressPercent = (currentQuestionIndex / total) * 100;

  pillRightEl.textContent = `Question ${questionNumber} of ${total}`;
  progressFillEl.style.width = `${progressPercent}%`;
  setBreadcrumbs("quiz");

  quizContentEl.innerHTML = `
    <div class="question-text">${q.question}</div>
    <p class="question-meta">${description}</p>
    <div class="options">
      ${optionsHtml}
    </div>
    <div class="feedback" id="feedback"></div>
    <div class="controls">
      <button class="secondary-button" id="exit-btn">Exit quiz</button>
      <button class="secondary-button" id="skip-btn">Skip</button>
      <button class="primary-button" id="next-btn" disabled>
        ${questionNumber < total ? "Next →" : "Finish quiz"}
      </button>
    </div>
  `;

  const optionButtons = Array.from(
    quizContentEl.querySelectorAll(".option-btn")
  );
  const feedbackEl = document.getElementById("feedback");
  const nextBtn = document.getElementById("next-btn");
  const skipBtn = document.getElementById("skip-btn");
  const exitBtn = document.getElementById("exit-btn");

  // Option click handler
  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (selectedOptionIndex !== null) return; // lock after pick
      const idx = Number(btn.getAttribute("data-index"));
      selectedOptionIndex = idx;

      const correctIndex = q.correctIndex;
      const isCorrect = selectedOptionIndex === correctIndex;

      if (isCorrect) score++;

      answers.push({
        questionIndex: realIndex,
        selected: selectedOptionIndex,
        correctIndex,
        isCorrect,
      });

      // Visual + text feedback only if not hiding feedback
      if (!hideFeedbackEnabled) {
        optionButtons.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");

        optionButtons.forEach((b) => {
          const bIdx = Number(b.getAttribute("data-index"));
          b.disabled = true;
          if (bIdx === correctIndex) {
            b.classList.add("correct");
          } else if (bIdx === selectedOptionIndex && !isCorrect) {
            b.classList.add("incorrect");
          }
        });

        feedbackEl.className =
          "feedback " + (isCorrect ? "correct" : "incorrect");
        feedbackEl.textContent = isCorrect
          ? "Correct!"
          : "Incorrect – the correct answer is highlighted.";
      } else {
        // Just acknowledge selection
        feedbackEl.className = "feedback";
        feedbackEl.textContent = "Answer selected.";
      }

      nextBtn.disabled = false;
    });
  });

  // Skip handler: records no answer, moves on
  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      const correctIndex = q.correctIndex;
      answers.push({
        questionIndex: realIndex,
        selected: null,
        correctIndex,
        isCorrect: false,
      });

      currentQuestionIndex++;
      if (currentQuestionIndex < total) {
        renderQuestion();
      } else {
        renderResult();
      }
    });
  }

  // Next / Finish handler
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (selectedOptionIndex === null) {
        // No selection made – treat as skipped
        const correctIndex = q.correctIndex;
        answers.push({
          questionIndex: realIndex,
          selected: null,
          correctIndex,
          isCorrect: false,
        });
      }

      currentQuestionIndex++;
      if (currentQuestionIndex < total) {
        renderQuestion();
      } else {
        renderResult();
      }
    });
  }

  if (exitBtn) {
    exitBtn.addEventListener("click", exitQuiz);
  }
}

/* ============================
   RENDER RESULT SCREEN
   ============================ */
async function renderResult() {
  const questions = currentQuizData.questions || [];
  const total = questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  // Save attempt to guest or Supabase
  const stats = await saveAttempt(currentQuizMeta, score, total);

  progressFillEl.style.width = "100%";
  pillRightEl.textContent = "Quiz complete";
  setBreadcrumbs("quiz");

  // Build summary
  const summaryHtml = answers
    .map((ans, i) => {
      const q = questions[ans.questionIndex];
      const user =
        ans.selected === null ? "No answer" : q.options[ans.selected];
      const correct = q.options[ans.correctIndex];
      const rowClass = ans.isCorrect ? "correct" : "incorrect";

      return `
        <div class="summary-item ${rowClass}">
          <div class="summary-question">
            ${i + 1}. ${q.question}
          </div>
          <div class="summary-answer">
            <span class="label">Your answer:</span>
            <span class="value">${user}</span>
          </div>
          <div class="summary-answer">
            <span class="label">Correct answer:</span>
            <span class="value">${correct}</span>
          </div>
        </div>
      `;
    })
    .join("");

  let statsLine = "";
  if (stats) {
    statsLine = `Attempts: <strong>${stats.attempts}</strong>`;
    if (stats.bestScore != null) {
      statsLine += ` • Best: <strong>${stats.bestScore}/${stats.bestTotal} (${stats.bestPercent}%)</strong>`;
    }
  }

  quizContentEl.innerHTML = `
    <div class="result-heading">
      Your results for "${currentQuizData.title || currentQuizMeta.title}"
    </div>
    <p class="result-score">
      You scored <strong>${score}</strong> out of <strong>${total}</strong> (${percent}%)
    </p>
    ${
      statsLine
        ? `<p class="result-detail">${statsLine}</p>`
        : `<p class="result-detail">
             Review your answers below, or go back to choose another quiz.
           </p>`
    }

    <div class="controls" style="margin-bottom: 6px; flex-wrap:wrap;">
      <button class="secondary-button" id="exit-btn">Exit quiz</button>
      <button class="secondary-button" id="next-quiz-btn">Next quiz in unit</button>
      <button class="secondary-button" id="random-unit-quiz-btn">Random quiz in unit</button>
      <button class="primary-button" id="retake-btn">Retake this quiz</button>
    </div>

    <div class="summary-list">
      ${summaryHtml}
    </div>
  `;

  const exitBtn = document.getElementById("exit-btn");
  const retakeBtn = document.getElementById("retake-btn");
  const nextBtn = document.getElementById("next-quiz-btn");
  const randomBtn = document.getElementById("random-unit-quiz-btn");

  if (exitBtn) exitBtn.addEventListener("click", exitQuiz);

  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      startQuiz(currentQuizMeta);
    });
  }

  const unit = currentUnit;
  const mod = currentModule;

  if (!unit || !unit.quizzes || unit.quizzes.length === 0) {
    if (nextBtn) nextBtn.disabled = true;
    if (randomBtn) randomBtn.disabled = true;
  } else {
    // Next quiz in unit
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const quizzes = unit.quizzes || [];
        const currentId = getQuizIdFromMeta(currentQuizMeta);
        const idx = quizzes.findIndex(
          (q) => getQuizIdFromMeta(q) === currentId
        );
        if (idx === -1 || idx === quizzes.length - 1) {
          alert("There is no next quiz in this unit.");
          return;
        }
        const nextMeta = quizzes[idx + 1];

        lastView = {
          view: "quizzes",
          moduleId: mod ? mod.id : null,
          unitId: unit.id,
        };
        startQuiz(nextMeta);
      });
    }

    // Random quiz in unit
    if (randomBtn) {
      randomBtn.addEventListener("click", () => {
        const quizzes = unit.quizzes || [];
        if (!quizzes.length) {
          alert("This unit has no quizzes.");
          return;
        }

        const currentId = getQuizIdFromMeta(currentQuizMeta);
        const pool = quizzes.filter(
          (q) => getQuizIdFromMeta(q) !== currentId
        );
        const chosen = pool.length ? pickRandomQuiz(pool) : pickRandomQuiz(quizzes);

        if (!chosen) {
          alert("This unit has no quizzes.");
          return;
        }

        lastView = {
          view: "quizzes",
          moduleId: mod ? mod.id : null,
          unitId: unit.id,
        };
        startQuiz(chosen);
      });
    }
  }
}

/* ============================
   SIDEBAR TOGGLES
   ============================ */
const shuffleToggleEl = document.getElementById("toggle-shuffle");
if (shuffleToggleEl) {
  shuffleToggleEl.addEventListener("change", (e) => {
    shuffleQuestionsEnabled = e.target.checked;
  });
}

const hideFeedbackToggleEl = document.getElementById("toggle-hide-feedback");
if (hideFeedbackToggleEl) {
  hideFeedbackToggleEl.addEventListener("change", (e) => {
    hideFeedbackEnabled = e.target.checked;
  });
}

/* ============================
   INITIALISATION
   ============================ */
initAuth();
loadModules();
