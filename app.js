(() => {
  "use strict";

  const el = (id) => document.getElementById(id);

  const screens = {
    setup: el("setup-screen"),
    practice: el("practice-screen"),
    done: el("done-screen"),
  };

  const poolStatus = el("pool-status");
  const categoryPillsRow = el("category-pills");
  const intervalPillsRow = el("interval-pills");
  const customIntervalRow = el("custom-interval-row");
  const customIntervalInput = el("custom-interval-input");
  const sessionLengthInput = el("session-length-input");
  const startBtn = el("start-btn");
  const setupError = el("setup-error");

  const hudNext = el("hud-next");
  const hudSession = el("hud-session");
  const faceImg = el("face-img");
  const pauseBtn = el("pause-btn");
  const nextBtn = el("next-btn");
  const fullscreenBtn = el("fullscreen-btn");
  const endBtn = el("end-btn");

  const doneSummary = el("done-summary");
  const restartBtn = el("restart-btn");

  let facePool = [];         // full list loaded from faces/images.json
  let activePool = [];       // facePool filtered by selectedCategories for the current session
  let selectedCategories = new Set(["adult", "child", "group"]);
  let shuffleQueue = [];     // remaining faces for this "lap" of the pool
  let lastFile = null;       // avoid immediate repeat across reshuffles
  let shownCount = 0;

  let intervalSeconds = 120;
  let sessionSeconds = 60 * 60;

  let sessionEndAt = 0;
  let nextFaceAt = 0;
  let pausedAt = 0;
  let paused = false;
  let tickHandle = null;

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
    screens[name].classList.remove("hidden");
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function categoryOf(face) {
    return face.category || "adult";
  }

  function poolForCategories(categories) {
    return facePool.filter((f) => categories.has(categoryOf(f)));
  }

  function refillQueue() {
    let next = shuffle(activePool);
    if (lastFile && next.length > 1 && next[0].file === lastFile) {
      [next[0], next[1]] = [next[1], next[0]];
    }
    shuffleQueue = next;
  }

  function drawNextFace() {
    if (shuffleQueue.length === 0) refillQueue();
    const face = shuffleQueue.shift();
    lastFile = face.file;
    shownCount += 1;
    faceImg.src = `faces/${face.file}`;
    faceImg.alt = face.credit || "Reference face for caricature practice";
    preloadUpcoming();
  }

  function preloadUpcoming() {
    if (shuffleQueue.length === 0) return;
    const img = new Image();
    img.src = `faces/${shuffleQueue[0].file}`;
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  // --- Setup screen ---

  let selectedIntervalSeconds = 60; // default to the "1 min" pill
  let customMode = false;
  intervalPillsRow.querySelector('[data-seconds="60"]')?.classList.add("active");

  intervalPillsRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    [...intervalPillsRow.children].forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");

    if (btn.dataset.custom) {
      customMode = true;
      customIntervalRow.classList.remove("hidden");
      selectedIntervalSeconds = parseCustomInterval();
    } else {
      customMode = false;
      customIntervalRow.classList.add("hidden");
      selectedIntervalSeconds = Number(btn.dataset.seconds);
    }
    validateSetup();
  });

  customIntervalInput.addEventListener("input", () => {
    selectedIntervalSeconds = parseCustomInterval();
    validateSetup();
  });

  sessionLengthInput.addEventListener("input", validateSetup);

  categoryPillsRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    const category = btn.dataset.category;
    const willBeActive = !btn.classList.contains("active");

    if (!willBeActive && selectedCategories.size === 1 && selectedCategories.has(category)) {
      return; // keep at least one category selected
    }

    btn.classList.toggle("active", willBeActive);
    if (willBeActive) selectedCategories.add(category);
    else selectedCategories.delete(category);

    updatePoolStatus();
    validateSetup();
  });

  function parseCustomInterval() {
    const v = Number(customIntervalInput.value);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function updatePoolStatus() {
    if (facePool.length === 0) return;
    const count = poolForCategories(selectedCategories).length;
    poolStatus.textContent = `${count} face${count === 1 ? "" : "s"} ready with the current selection.`;
  }

  function validateSetup() {
    const sessionMinutes = Number(sessionLengthInput.value);
    const ok =
      poolForCategories(selectedCategories).length > 0 &&
      selectedIntervalSeconds != null &&
      selectedIntervalSeconds > 0 &&
      Number.isFinite(sessionMinutes) &&
      sessionMinutes > 0;
    startBtn.disabled = !ok;
  }

  startBtn.addEventListener("click", () => {
    activePool = poolForCategories(selectedCategories);
    intervalSeconds = selectedIntervalSeconds;
    sessionSeconds = Number(sessionLengthInput.value) * 60;
    startSession();
  });

  restartBtn.addEventListener("click", () => showScreen("setup"));

  // --- Practice screen ---

  function startSession() {
    shuffleQueue = [];
    lastFile = null;
    shownCount = 0;
    paused = false;
    pauseBtn.textContent = "Pause";

    const now = Date.now();
    sessionEndAt = now + sessionSeconds * 1000;
    nextFaceAt = now + intervalSeconds * 1000;

    drawNextFace();
    showScreen("practice");
    startTicking();
  }

  function startTicking() {
    stopTicking();
    tickHandle = setInterval(tick, 250);
    tick();
  }

  function stopTicking() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function tick() {
    if (paused) return;
    const now = Date.now();

    if (now >= sessionEndAt) {
      endSession();
      return;
    }

    if (now >= nextFaceAt) {
      drawNextFace();
      nextFaceAt = now + intervalSeconds * 1000;
    }

    hudNext.textContent = `Next: ${formatClock((nextFaceAt - now) / 1000)}`;
    hudSession.textContent = `Session: ${formatClock((sessionEndAt - now) / 1000)} left`;
  }

  function endSession() {
    stopTicking();
    const minutes = Math.round(sessionSeconds / 60);
    doneSummary.textContent = `You practiced ${shownCount} face${shownCount === 1 ? "" : "s"} in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    showScreen("done");
  }

  pauseBtn.addEventListener("click", togglePause);

  function togglePause() {
    const now = Date.now();
    if (!paused) {
      paused = true;
      pausedAt = now;
      pauseBtn.textContent = "Resume";
    } else {
      paused = false;
      const pausedDuration = now - pausedAt;
      sessionEndAt += pausedDuration;
      nextFaceAt += pausedDuration;
      pauseBtn.textContent = "Pause";
    }
  }

  nextBtn.addEventListener("click", () => {
    if (paused) return;
    drawNextFace();
    nextFaceAt = Date.now() + intervalSeconds * 1000;
  });

  endBtn.addEventListener("click", endSession);

  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (screens.practice.classList.contains("hidden")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
    } else if (e.code === "ArrowRight" || e.key === "n" || e.key === "N") {
      nextBtn.click();
    }
  });

  // --- Load face pool ---

  async function loadPool() {
    try {
      const res = await fetch("faces/images.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error("empty pool");
      facePool = data;
      updatePoolStatus();
      setupError.classList.add("hidden");
    } catch (err) {
      facePool = [];
      poolStatus.textContent = "No face pool found.";
      setupError.textContent =
        "Couldn't load faces/images.json. Run tools/download_pexels.py to build your face pool, and make sure you're viewing this page through a local server (not file://).";
      setupError.classList.remove("hidden");
    }
    validateSetup();
  }

  showScreen("setup");
  loadPool();
})();
