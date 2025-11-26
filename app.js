// ================================
// Theme toggle
// ================================

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

// ================================
// Sidebar open/close
// ================================

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

// ================================
// Supabase client & auth
// ================================

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

// ================================
// Guest results (localStorage) & Supabase quiz stats
// ================================

function getQuizIdFromMeta(quizMeta) {
  return quizMeta && quizMeta.id ? quizMeta.id : quizMeta.path;
}

const GUEST_RESULTS_KEY = "mcqGuestResults";
const GUEST_IMPORTED_KEY = "mcqGuestResultsImported";

function hasGuestBeenImported() {
  return localStorage.getItem(GUEST_IMPORTED_KEY) === "true";
}

function markGuestImported() {
  localStorage.setItem(GUEST_IMPORTED_KEY, "true");
}

function loadGuestResults() {
  try {
    const raw = localStorage.getItem(GUEST_RESULTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveGuestResults(all) {
  try {
    localStorage.setItem(GUEST_RESULTS_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("Failed to save guest results", e);
  }
}

function updateGuestQuizResults(quizMeta, score, total) {
  const quizId = getQuizIdFromMeta(quizMeta);
  const all = loadGuestResults();
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
  saveGuestResults(all);
  return updated;
}

function getGuestQuizResults(quizMeta) {
  const quizId = getQuizIdFromMeta(quizMeta);
  const all = loadGuestResults();
  return all[quizId] || null;
}

async function saveAttemptToSupabase(quizMeta, score, total) {
  if (!supabaseClient || !currentUser) return null;

  const quizId = getQuizIdFromMeta(quizMeta);
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

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

// Simple in-memory cache so mastery doesn't re-query constantly
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
  if (quizStatsCache[key]) {
    return quizStatsCache[key];
  }

  let stats;
  if (supabaseClient && currentUser) {
    stats = await fetchQuizStatsFromSupabase(quizMeta);
  } else {
    stats = getGuestQuizResults(quizMeta);
  }
  quizStatsCache[key] = stats;
  return stats;
}

// Import guest results -> Supabase
async function importGuestResultsToSupabase() {
  if (!supabaseClient || !currentUser) return;

  const all = loadGuestResults();
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

  if (rows.length === 0) {
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

// ================================
// Auth panel / Supabase auth flow
// ================================

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

  if (!currentUser) {
    // Guest mode: login + signup
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

    async function getAuthCredentials() {
      const emailInput = /** @type {HTMLInputElement} */ (
        document.getElementById("auth-email")
      );
      const passwordInput = /** @type {HTMLInputElement} */ (
        document.getElementById("auth-password")
      );
      const email = (emailInput.value || "").trim();
      const password = passwordInput.value;

      if (!email || !password) {
        alert("Please enter an email and password.");
        return null;
      }
      return { email, password };
    }

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        if (!supabaseClient) return;
        const creds = await getAuthCredentials();
        if (!creds) return;

        const { email, password } = creds;
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
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
        if (!supabaseClient) return;
        const creds = await getAuthCredentials();
        if (!creds) return;

        const { email, password } = creds;
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
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
  } else {
    // Logged-in UI + optional guest import
    const guestHasData = Object.keys(loadGuestResults()).length > 0;
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

// ================================
// Mastery calculations (unit & module)
// ================================

function getMasteryCategory(percent) {
  if (percent == null || Number.isNaN(percent)) {
    return null;
  }
  if (percent >= 70) {
    return { label: "Strong", className: "mastery-badge bad-high" };
  }
  if (percent >= 40) {
    return { label: "Developing", className: "mastery-badge bad-mid" };
  }
  return { label: "Needs work", className: "mastery-badge bad-low" };
}

async function calculateUnitMastery(unit) {
  const quizzes = unit.quizzes || [];
  if (!quizzes.length) {
    return { percent: null, category: null, attempted: 0, total: 0 };
  }

  const percents = [];
  let attemptedCount = 0;

  for (const q of quizzes) {
    const stats = await getQuizStats(q);
    const best =
      stats && typeof stats.bestPercent === "number" ? stats.bestPercent : 0;
    if (stats && stats.attempts > 0) {
      attemptedCount++;
    }
    percents.push(best);
  }

  const avg = percents.length
    ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
    : 0;

  return {
    percent: avg,
    category: getMasteryCategory(avg),
    attempted: attemptedCount,
    total: quizzes.length,
  };
}

async function calculateModuleMastery(module) {
  const units = module.units || [];
  if (!units.length) {
    return { percent: null, category: null, attempted: 0, total: 0 };
  }

  const unitPercents = [];
  let totalQuizzes = 0;
  let totalAttempted = 0;

  for (const u of units) {
    const result = await calculateUnitMastery(u);
    if (result.total > 0) {
      unitPercents.push(result.percent ?? 0);
      totalQuizzes += result.total;
      totalAttempted += result.attempted;
    }
  }

  if (!unitPercents.length) {
    return { percent: null, category: null, attempted: 0, total: 0 };
  }

  const avg = Math.round(
    unitPercents.reduce((a, b) => a + b, 0) / unitPercents.length
  );

  return {
    percent: avg,
    category: getMasteryCategory(avg),
    attempted: totalAttempted,
    total: totalQuizzes,
  };
}

// ================================
// Random Quiz Selection
// ================================

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

// ================================
// MCQ APP LOGIC
// ================================

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
let lastView = {
  moduleId: null, // string | null
  unitId: null,   // string | null
  view: "modules" // "modules" | "units" | "quizzes"
};

const quizContentEl = document.getElementById("quiz-content");
const cardTitleEl = document.getElementById("card-title");
const pillRightEl = document.getElementById("pill-right");
const progressContainerEl = document.getElementById("progress-container");
const progressFillEl = document.getElementById("progress-fill");
const breadcrumbsEl = document.getElementById("breadcrumbs");

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function loadModules() {
  try {
    const res = await fetch("modules.json");
    if (!res.ok) throw new Error("Failed to load modules.json");
    modules = await res.json();
    renderModuleList();
  } catch (err) {
    console.error(err);
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

function setBreadcrumbs(level) {
  const bits = [];
  bits.push(`<span data-level="modules">Modules</span>`);

  if (currentModule && level !== "modules") {
    bits.push("›");
    bits.push(`<span data-level="units">${currentModule.name}</span>`);
  }
  if (currentUnit && (level === "quizzes" || level === "quiz")) {
    bits.push("›");
    bits.push(`<span data-level="quizzes">${currentUnit.name}</span>`);
  }
  if (currentQuizMeta && level === "quiz") {
    bits.push("›");
    bits.push(`<span>${currentQuizMeta.title}</span>`);
  }

  breadcrumbsEl.innerHTML = bits.join(" ");

  Array.from(breadcrumbsEl.querySelectorAll("span[data-level]")).forEach(
    (el) => {
      el.addEventListener("click", () => {
        const lvl = el.getAttribute("data-level");
        if (lvl === "modules") {
          renderModuleList();
        } else if (lvl === "units") {
          renderUnitList(currentModule.id);
        } else if (lvl === "quizzes") {
          renderQuizList(currentUnit.id);
        }
      });
    }
  );
}

function renderModuleList() {
  currentModule = null;
  currentUnit = null;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];

  cardTitleEl.textContent =
    "A Level Ancient History – Multiple Choice Quizzes";
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0";
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

  const html = `
    <div class="list">
      ${modules
        .map(
          (m) => `
        <div class="list-item" data-id="${m.id}">
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

  quizContentEl.innerHTML = html;

  // Click card -> open unit list
  document.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      renderUnitList(id);
    });
  });

  // Random quiz per module
  document.querySelectorAll("[data-random-module]").forEach((btn) => {
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

      // record where we came from
      lastView = {
        moduleId: mod.id,
        unitId: null,
        view: "modules"
      };

      startQuiz(chosen);
    });
  });

  // Mastery for each module
  modules.forEach(async (m) => {
    const el = document.querySelector(
      `.mastery-text[data-master-for-module="${m.id}"]`
    );
    if (!el) return;
    const result = await calculateModuleMastery(m);
    if (!result || !result.total) {
      el.textContent = "";
      return;
    }
    const { percent, attempted, total, category } = result;
    const badgeClass =
      category && category.className ? category.className : "mastery-badge";

    el.innerHTML =
      `• <span class="mastery-tooltip">
           <span class="${badgeClass}">Mastery: ${percent}%</span>
           <span class="tooltip-text">
             This represents your average best score across all quizzes in this module.
             Unattempted quizzes count as 0% until you try them.
           </span>
         </span>
         <span>• ${attempted}/${total} quizzes attempted</span>`;
  });
}

function renderUnitList(moduleId) {
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) return;

  currentModule = mod;
  currentUnit = null;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];

  cardTitleEl.textContent = mod.name;
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0";
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
      .addEventListener("click", () => renderModuleList());
    return;
  }

  const html = `
    <div class="list">
      ${units
        .map(
          (u) => `
        <div class="list-item" data-id="${u.id}">
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

  quizContentEl.innerHTML = html;

  document.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      renderQuizList(id);
    });
  });

  document
    .getElementById("back-modules")
    .addEventListener("click", () => renderModuleList());

  // Random quiz per unit
  document.querySelectorAll("[data-random-unit]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const unitId = btn.getAttribute("data-random-unit");
      const unit = currentModule.units.find((u) => u.id === unitId);
      if (!unit) return;

      const quizzes = getAllQuizzesInUnit(unit);
      const chosen = pickRandomQuiz(quizzes);
      if (!chosen) {
        alert("This unit has no quizzes.");
        return;
      }

      // record where we came from
      lastView = {
        moduleId: currentModule.id,
        unitId: unit.id,
        view: "units"
      };

      startQuiz(chosen);
    });
  });

  // Mastery for each unit
  units.forEach(async (u) => {
    const el = document.querySelector(
      `.mastery-text[data-master-for-unit="${u.id}"]`
    );
    if (!el) return;
    const result = await calculateUnitMastery(u);
    if (!result || !result.total) {
      el.textContent = "";
      return;
    }
    const { percent, attempted, total, category } = result;
    const badgeClass =
      category && category.className ? category.className : "mastery-badge";

    el.innerHTML =
      `• <span class="mastery-tooltip">
           <span class="${badgeClass}">Mastery: ${percent}%</span>
           <span class="tooltip-text">
             This represents your average best score across all quizzes in this unit.
             Unattempted quizzes count as 0% until you try them.
           </span>
         </span>
         <span>• ${attempted}/${total} quizzes attempted</span>`;
  });
}

function renderQuizList(unitId) {
  if (!currentModule) return;
  const unit = (currentModule.units || []).find((u) => u.id === unitId);
  if (!unit) return;

  currentUnit = unit;
  currentQuizMeta = null;
  currentQuizData = null;
  questionOrder = [];

  cardTitleEl.textContent = unit.name;
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0";
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

  const html = `
    <div class="list">
      ${quizzes
        .map(
          (q) => `
        <button class="list-item" data-id="${q.id}">
          <div class="list-title">${q.title}</div>
          <div class="list-meta" data-stats-for="${q.id}">
            <span>${currentUser ? "Loading stats…" : "Guest: progress saved on this device"}</span>
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

  quizContentEl.innerHTML = html;

  document.querySelectorAll(".list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const meta = quizzes.find((q) => q.id === id);
      if (meta) {
        // record that we came from the quiz list
        lastView = {
          moduleId: currentModule.id,
          unitId: currentUnit.id,
          view: "quizzes"
        };
        startQuiz(meta);
      }
    });
  });

  document
    .getElementById("back-units")
    .addEventListener("click", () => renderUnitList(currentModule.id));

  // Populate quiz stats
  quizzes.forEach(async (q) => {
    const metaEl = document.querySelector(
      `.list-meta[data-stats-for="${q.id}"]`
    );
    if (!metaEl) return;

    const stats = await getQuizStats(q);
    if (!stats || !stats.attempts) {
      metaEl.innerHTML = currentUser
        ? `<span>Not attempted yet</span>`
        : `<span>Guest: not attempted yet</span>`;
    } else {
      metaEl.innerHTML = `
        <span>Attempts: ${stats.attempts}</span>
        <span>•</span>
        <span>Best: ${stats.bestScore}/${stats.bestTotal} (${stats.bestPercent}%)</span>
      `;
    }
  });
}

async function startQuiz(quizMeta) {
  currentQuizMeta = quizMeta;
  currentQuizData = null;
  currentQuestionIndex = 0;
  selectedOptionIndex = null;
  score = 0;
  answers.length = 0;
  questionOrder = [];

  setBreadcrumbs("quiz");
  pillRightEl.textContent = "Loading quiz…";
  progressContainerEl.style.display = "none";
  progressFillEl.style.width = "0";

  quizContentEl.innerHTML = `
    <p>Loading quiz <strong>${quizMeta.title}</strong>…</p>
    <p class="helper-text">File: <code>${quizMeta.path}</code></p>
  `;

  try {
    const res = await fetch(quizMeta.path);
    if (!res.ok) throw new Error("Failed to load quiz JSON");
    const data = await res.json();
    currentQuizData = data;

    const questions = currentQuizData.questions || [];
    questionOrder = questions.map((_, i) => i);
    if (shuffleQuestionsEnabled) {
      shuffleArray(questionOrder);
    }

    cardTitleEl.textContent = data.title || quizMeta.title;
    progressContainerEl.style.display = "block";
    renderQuestion();
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
    document
      .getElementById("back-quizzes")
      .addEventListener("click", () => exitQuiz());
  }
}

// Decide where to go when "Exit quiz" / "Back to quizzes" is clicked
function exitQuiz() {
  if (!lastView) {
    renderModuleList();
    return;
  }

  if (lastView.view === "quizzes" && lastView.unitId) {
    renderQuizList(lastView.unitId);
    return;
  }

  if (lastView.view === "units" && lastView.moduleId) {
    renderUnitList(lastView.moduleId);
    return;
  }

  if (lastView.view === "modules") {
    renderModuleList();
    return;
  }

  // Fallback
  renderModuleList();
}

function renderQuestion() {
  const questions = currentQuizData.questions || [];
  const orderIndex = questionOrder[currentQuestionIndex] ?? currentQuestionIndex;
  const q = questions[orderIndex];
  if (!q) return;

  selectedOptionIndex = null;
  currentOptionOrder = q.options.map((_, i) => i);
  shuffleArray(currentOptionOrder);

  setBreadcrumbs("quiz");
  pillRightEl.textContent = `Question ${
    currentQuestionIndex + 1
  } of ${questions.length}`;

  const progressPercent = (currentQuestionIndex / questions.length) * 100;
  progressFillEl.style.width = `${progressPercent}%`;

  const optionLetters = ["A", "B", "C", "D", "E", "F", "G", "H"];

  const optionsHtml = currentOptionOrder
    .map((optIdx, displayIdx) => {
      const label = optionLetters[displayIdx] ?? "";
      const text = q.options[optIdx];
      return `
        <button class="option-btn" data-index="${optIdx}">
          <span class="option-label">${label}.</span>
          <span class="option-text">${text}</span>
        </button>
      `;
    })
    .join("");

  quizContentEl.innerHTML = `
    <div class="question-text">${q.question}</div>
    <p class="question-meta">${
      currentQuizData.description || "Choose one answer."
    }</p>
    <div class="options">
      ${optionsHtml}
    </div>
    <div class="feedback" id="feedback"></div>
    <div class="controls">
      <button class="secondary-button" id="back-to-quizzes">Exit quiz</button>
      <button class="secondary-button" id="skip-btn">Skip</button>
      <button class="primary-button" id="next-btn" disabled>
        Next →
      </button>
    </div>
  `;

  document
    .querySelectorAll(".option-btn")
    .forEach((btn) => btn.addEventListener("click", onOptionClick));
  document.getElementById("next-btn").addEventListener("click", onNext);
  document.getElementById("skip-btn").addEventListener("click", onSkip);
  document
    .getElementById("back-to-quizzes")
    .addEventListener("click", () => exitQuiz());
}

function onOptionClick(e) {
  const btn = e.currentTarget;
  const index = Number(btn.getAttribute("data-index"));
  selectedOptionIndex = index;

  document.querySelectorAll(".option-btn").forEach((b) => {
    b.classList.remove("selected");
  });
  btn.classList.add("selected");

  document.getElementById("next-btn").disabled = false;
  const feedbackEl = document.getElementById("feedback");
  feedbackEl.textContent = "Answer selected.";
  feedbackEl.className = "feedback";
}

function lockOptionsAndShowFeedback(isCorrect, correctIndex) {
  const feedbackEl = document.getElementById("feedback");
  feedbackEl.className = "feedback " + (isCorrect ? "correct" : "incorrect");

  document.querySelectorAll(".option-btn").forEach((btn) => {
    const idx = Number(btn.getAttribute("data-index"));
    btn.disabled = true;
    btn.classList.remove("selected");

    if (idx === correctIndex) {
      btn.classList.add("correct");
    } else if (idx === selectedOptionIndex && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  if (isCorrect) {
    feedbackEl.innerHTML = `<span>Correct!</span> Nice job.`;
  } else if (selectedOptionIndex === null) {
    feedbackEl.innerHTML = `<span>Skipped.</span> The correct answer is highlighted.`;
  } else {
    feedbackEl.innerHTML = `<span>Incorrect.</span> The correct answer is highlighted.`;
  }
}

function onNext() {
  const questions = currentQuizData.questions;
  const orderIndex = questionOrder[currentQuestionIndex] ?? currentQuestionIndex;
  const q = questions[orderIndex];
  const correctIndex = q.correctIndex;
  const isCorrect = selectedOptionIndex === correctIndex;

  if (selectedOptionIndex !== null && isCorrect) {
    score++;
  }

  answers.push({
    questionIndex: orderIndex,
    selected: selectedOptionIndex,
    correctIndex,
    isCorrect,
  });

  if (hideFeedbackEnabled) {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
      renderQuestion();
    } else {
      renderResult();
    }
  } else {
    lockOptionsAndShowFeedback(isCorrect, correctIndex);
    setTimeout(() => {
      currentQuestionIndex++;
      if (currentQuestionIndex < questions.length) {
        renderQuestion();
      } else {
        renderResult();
      }
    }, 650);
  }
}

function onSkip() {
  const questions = currentQuizData.questions;
  const orderIndex = questionOrder[currentQuestionIndex] ?? currentQuestionIndex;
  const q = questions[orderIndex];
  const correctIndex = q.correctIndex;

  answers.push({
    questionIndex: orderIndex,
    selected: null,
    correctIndex,
    isCorrect: false,
  });

  if (hideFeedbackEnabled) {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
      renderQuestion();
    } else {
      renderResult();
    }
  } else {
    lockOptionsAndShowFeedback(false, correctIndex);
    setTimeout(() => {
      currentQuestionIndex++;
      if (currentQuestionIndex < questions.length) {
        renderQuestion();
      } else {
        renderResult();
      }
    }, 650);
  }
}

async function renderResult() {
  const questions = currentQuizData.questions;
  const total = questions.length;
  const percent = Math.round((score / total) * 100);

  const stats = await saveAttempt(currentQuizMeta, score, total);

  progressFillEl.style.width = "100%";
  pillRightEl.textContent = "Quiz complete";
  setBreadcrumbs("quiz");

  const summaryItemsHtml = answers
    .map((ans, i) => {
      const q = questions[ans.questionIndex];
      const qNumber = i + 1;
      const userAnswerText =
        ans.selected === null ? "No answer" : q.options[ans.selected];
      const correctAnswerText = q.options[ans.correctIndex];
      const userClass = ans.isCorrect ? "correct" : "incorrect";

      return `
        <div class="summary-item">
          <div class="summary-question">
            ${qNumber}. ${q.question}
          </div>
          <div class="summary-answer ${userClass}">
            <span class="label">Your answer:</span>
            <span class="value"> ${userAnswerText}</span>
          </div>
          <div class="summary-answer">
            <span class="label">Correct answer:</span>
            <span class="value"> ${correctAnswerText}</span>
          </div>
        </div>
      `;
    })
    .join("");

  let statsLine = "";
  if (stats) {
    statsLine = "Attempts: <strong>" + stats.attempts + "</strong>";
    if (stats.bestScore != null) {
      statsLine +=
        " • Best: <strong>" +
        stats.bestScore +
        "/" +
        stats.bestTotal +
        " (" +
        stats.bestPercent +
        "%)</strong>";
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
            Review your answers below, or go back to choose another quiz in this unit.
          </p>`
    }

    <div class="controls" style="margin-bottom: 6px;">
      <button class="secondary-button" id="back-quizzes">Exit quiz</button>
      <button class="primary-button" id="restart-btn">Retake this quiz</button>
    </div>

    <div class="summary-list">
      ${summaryItemsHtml}
    </div>
  `;

  document.getElementById("restart-btn").addEventListener("click", () => {
    startQuiz(currentQuizMeta);
  });

  document
    .getElementById("back-quizzes")
    .addEventListener("click", () => exitQuiz());
}

// ================================
// Sidebar toggles (shuffle, hide-feedback)
// ================================

const shuffleToggleEl = document.getElementById("toggle-shuffle");
const hideFeedbackToggleEl = document.getElementById("toggle-hide-feedback");

if (shuffleToggleEl) {
  shuffleToggleEl.addEventListener("change", (e) => {
    shuffleQuestionsEnabled = e.target.checked;
  });
}

if (hideFeedbackToggleEl) {
  hideFeedbackToggleEl.addEventListener("change", (e) => {
    hideFeedbackEnabled = e.target.checked;
  });
}

// ================================
// Initialise
// ================================

loadModules();
initAuth();
