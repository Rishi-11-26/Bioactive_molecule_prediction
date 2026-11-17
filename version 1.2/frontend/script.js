/* ============================================================
   BioPredict — script.js
   Inference, 3D viewer, batch screening, benchmark + UI motion
   ============================================================ */

const API_BASE = (window.location.protocol === "file:")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

const EXAMPLES = [
  "Aspirin", "Celecoxib", "Ibuprofen", "Paracetamol", "Diclofenac", "Naproxen", "Meloxicam", "Caffeine",
  "Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1",
  "CC(=O)Oc1ccccc1C(=O)O",
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
  "O=C(O)Cc1ccccc1Nc1c(Cl)cccc1Cl",
  "O=S(=O)(c1ccc(C2=C(c3ccccc3)C(=O)OC2)cc1)C",
  "Cc1nc(NC(=O)c2c(O)c3ccccc3s(=O)(=O)n2C)cs1",
  "COc1ccc2cc(C(C)C(=O)O)ccc2c1",
  "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
];

const $ = (id) => document.getElementById(id);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let exampleIdx = 0;
let viewer3D = null;
let heroViewer = null;
let isSpinning = true;
let currentStyle = "ballstick";
let currentHighlight = null;
let currentMol3D = "";
let currentAttribution = null;
let isHighlightActive = false;
let batchDataCache = null;
let modelsCache = null;

function startApp() {
  refreshIcons();
  initNav();
  initReveal();
  initCountUp();
  initHealthCheck();
  initSinglePrediction();
  initBatchPrediction();
  initBenchmark();
  initLightbox();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startApp);
else startApp();

setInterval(initHealthCheck, 10000);

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.9 } });
}

function setButtonContent(btn, icon, label) {
  btn.innerHTML = `<i data-lucide="${icon}"></i> <span>${label}</span>`;
  refreshIcons();
}

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ─── Ambient drifting molecules (optimized lightweight canvas) ─── */
function initAmbientMolecules() {
  const canvas = $("moleculeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const palette = ["15,148,136", "90,169,230", "233,162,59", "124,196,184"];
  let w, h, molecules = [];
  let lastTime = 0;

  function makeMolecule() {
    const atoms = [];
    const n = 3 + Math.floor(Math.random() * 3);
    const ring = Math.random() > 0.5;
    const r = 12 + Math.random() * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      atoms.push(ring
        ? { x: Math.cos(a) * r, y: Math.sin(a) * r, s: 2.5 + Math.random() * 1.5 }
        : { x: (i - n / 2) * r * 0.9, y: (i % 2 ? 1 : -1) * r * 0.4, s: 2.5 + Math.random() * 1.5 });
    }
    return {
      x: Math.random() * w, y: Math.random() * h, atoms, ring,
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.002,
      color: palette[Math.floor(Math.random() * palette.length)],
      alpha: 0.12 + Math.random() * 0.1, scale: 0.7 + Math.random() * 0.6
    };
  }

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const count = Math.min(8, Math.max(4, Math.round((w * h) / 120000)));
    molecules = Array.from({ length: count }, makeMolecule);
  }

  function draw(now) {
    if (document.hidden || prefersReducedMotion) {
      requestAnimationFrame(draw);
      return;
    }
    // Throttle to 30 FPS to save CPU and GPU for WebGL 3Dmol
    if (now - lastTime < 33) {
      requestAnimationFrame(draw);
      return;
    }
    lastTime = now;

    ctx.clearRect(0, 0, w, h);
    for (let j = 0; j < molecules.length; j++) {
      const m = molecules[j];
      m.x += m.vx; m.y += m.vy; m.rot += m.vr;
      if (m.x < -60) m.x = w + 60; if (m.x > w + 60) m.x = -60;
      if (m.y < -60) m.y = h + 60; if (m.y > h + 60) m.y = -60;
      ctx.save();
      ctx.translate(m.x, m.y); ctx.rotate(m.rot); ctx.scale(m.scale, m.scale);
      ctx.strokeStyle = `rgba(${m.color},${m.alpha * 0.8})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < m.atoms.length; i++) {
        const a = m.atoms[i];
        const b = m.atoms[(i + 1) % m.atoms.length];
        if (!m.ring && i === m.atoms.length - 1) continue;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      for (let i = 0; i < m.atoms.length; i++) {
        const a = m.atoms[i];
        ctx.beginPath();
        ctx.fillStyle = `rgba(${m.color},${m.alpha + 0.1})`;
        ctx.arc(a.x, a.y, a.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(draw);
}

/* ─── Navigation, scroll progress, active links ───────────── */
function initNav() {
  const navbar = $("navbar");
  const progress = $("scrollProgress");
  const toggle = $("navToggle");
  const links = $("navLinks");

  const onScroll = () => {
    const y = window.scrollY;
    navbar?.classList.toggle("scrolled", y > 12);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  toggle?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    links.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  }));

  const sections = ["predict", "batch", "benchmark", "about"].map($).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links?.querySelectorAll("a").forEach(a =>
          a.classList.toggle("active", a.dataset.section === e.target.id));
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => io.observe(s));
}

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(e => io.observe(e));
}

function animateNumber(el, target, decimals = 0, duration = 1400, suffix = "") {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (target * eased).toLocaleString(undefined, {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCountUp() {
  const els = document.querySelectorAll(".count-up");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      animateNumber(el, parseFloat(el.dataset.target), parseInt(el.dataset.decimals || "0", 10));
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach(e => io.observe(e));
}

/* ─── 3Dmol helpers ───────────────────────────────────────── */
function when3DmolReady(cb, attempts = 0) {
  if (window.$3Dmol) return cb(true);
  if (attempts > 40) return cb(false);
  setTimeout(() => when3DmolReady(cb, attempts + 1), 150);
}

function styleFor(kind) {
  if (kind === "stick") return { stick: { radius: 0.2, colorscheme: "Jmol" } };
  if (kind === "sphere") return { sphere: { scale: 1.0, colorscheme: "Jmol" } };
  return { stick: { radius: 0.16, colorscheme: "Jmol" }, sphere: { scale: 0.3, colorscheme: "Jmol" } };
}

let isHeroVisible = true;
let isViewer3DVisible = true;

function initHeroViewer() {
  const el = $("heroViewer");
  if (!el || !window.HERO_MOLECULE) return;
  when3DmolReady((ok) => {
    if (!ok) return;
    heroViewer = $3Dmol.createViewer(el, { backgroundColor: "white", backgroundAlpha: 0, antialias: true });
    heroViewer.addModel(window.HERO_MOLECULE, "sdf");
    heroViewer.setStyle({}, styleFor("ballstick"));
    heroViewer.zoomTo();
    heroViewer.zoom(1.15);
    heroViewer.render();
    if (!prefersReducedMotion) heroViewer.spin("y", 0.4);

    // Pause WebGL rendering when hero is scrolled out of view to free 100% GPU for the rest of the page
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          isHeroVisible = e.isIntersecting;
          if (heroViewer) {
            heroViewer.spin(isHeroVisible && !prefersReducedMotion ? "y" : false, 0.4);
          }
        });
      }, { threshold: 0.05 });
      obs.observe(el);
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => heroViewer && isHeroVisible && heroViewer.resize(), 150);
    }, { passive: true });
  });
}

/* ─── Health check ────────────────────────────────────────── */
async function initHealthCheck() {
  const dot = $("statusDot");
  const text = $("statusText");
  try {
    const opts = {};
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      opts.signal = AbortSignal.timeout(4000);
    }
    const res = await fetch(`${API_BASE}/health`, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (dot) dot.className = "status-dot online";
    if (text) text.textContent = "API online";
  } catch {
    if (dot) dot.className = "status-dot offline";
    if (text) text.textContent = "API offline";
  }
}

/* ─── Main 3D viewer (High-performance, stutter-free rotation) ─── */
function render3DMolecule(mol3dBlock, highlightIndices = null) {
  const container = $("mol3dContainer");
  const emptyEl = $("stageEmpty");
  const tools = $("viewerTools");
  const legend = $("atomLegend");
  if (!container) return;
  currentHighlight = highlightIndices;

  if (!mol3dBlock || !mol3dBlock.trim()) {
    if (viewer3D) viewer3D.clear();
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.querySelector("strong").textContent = "3D model unavailable";
      emptyEl.querySelector("p").textContent = "A 3D conformer could not be generated for this compound.";
    }
    if (tools) tools.hidden = true;
    if (legend) legend.hidden = true;
    return;
  }

  when3DmolReady((ok) => {
    if (!ok) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.querySelector("strong").textContent = "3D engine failed to load";
        emptyEl.querySelector("p").textContent = "Check your internet connection and refresh the page.";
      }
      return;
    }
    if (!viewer3D) {
      viewer3D = $3Dmol.createViewer(container, {
        backgroundColor: "white",
        backgroundAlpha: 1,
        antialias: false
      });

      // Pause spin immediately when dragging starts WITHOUT running heavy DOM scans
      container.addEventListener("mousedown", () => {
        if (isSpinning) {
          isSpinning = false;
          viewer3D.spin(false);
          updateSpinButtonUI(false);
        }
      });
      container.addEventListener("touchstart", () => {
        if (isSpinning) {
          isSpinning = false;
          viewer3D.spin(false);
          updateSpinButtonUI(false);
        }
      }, { passive: true });

      // Pause WebGL rendering when viewer is scrolled out of view
      if ("IntersectionObserver" in window) {
        const obs = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            isViewer3DVisible = e.isIntersecting;
            if (viewer3D) {
              viewer3D.spin(isSpinning && isViewer3DVisible && !prefersReducedMotion ? "y" : false, 0.45);
            }
          });
        }, { threshold: 0.05 });
        obs.observe(container);
      }

      let resizeTimer;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => viewer3D && isViewer3DVisible && viewer3D.resize(), 150);
      }, { passive: true });
    }

    viewer3D.clear();
    viewer3D.addModel(mol3dBlock, "sdf");
    viewer3D.setStyle({}, styleFor(currentStyle));

    if (highlightIndices && highlightIndices.length) {
      const hl = currentStyle === "sphere"
        ? { sphere: { color: "#f59e0b", scale: 1.05 } }
        : { sphere: { color: "#f59e0b", scale: 0.5 }, stick: { color: "#f59e0b", radius: 0.22 } };
      viewer3D.addStyle({ index: highlightIndices }, hl);
    }

    viewer3D.zoomTo();
    viewer3D.zoom(1.1);
    viewer3D.render();
    if (emptyEl) emptyEl.hidden = true;
    if (tools) tools.hidden = false;
    if (legend) legend.hidden = false;
    setSpin(!prefersReducedMotion);
  });
}

function updateSpinButtonUI(on) {
  const btn = $("btnToggleSpin");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(on));
  const span = btn.querySelector("span");
  if (span) span.textContent = on ? "Pause" : "Rotate";
  const icon = btn.querySelector("i, svg");
  if (icon) {
    icon.setAttribute("data-lucide", on ? "pause" : "play");
    if (window.lucide) window.lucide.createIcons({ root: btn });
  }
}

function setSpin(on) {
  isSpinning = on;
  if (viewer3D) {
    viewer3D.spin(on && isViewer3DVisible ? "y" : false, 0.45);
  }
  updateSpinButtonUI(on);
}

/* ─── Explainable AI ──────────────────────────────────────── */
function renderXAI(attribution) {
  const container = $("xaiContainer");
  const list = $("xaiSubstructuresList");
  const btnToggle = $("btnToggleAttribution");
  const btnText = $("btnAttributionText");
  if (!container || !list) return;

  const subs = attribution?.top_substructures || [];
  if (!subs.length) { container.hidden = true; return; }

  container.hidden = false;
  list.innerHTML = "";
  isHighlightActive = false;
  if (btnText) btnText.textContent = "Highlight key atoms";
  const maxImp = Math.max(...subs.map(s => s.importance || 0), 1e-9);

  subs.forEach((sub, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "xai-chip";
    chip.style.animation = `rise .5s ${i * 70}ms var(--ease) both`;
    chip.innerHTML = `
      <div class="xai-chip-header">
        <span class="xai-chip-title">${escapeHtml(sub.description)}</span>
        <span class="xai-chip-weight">${(sub.importance * 100).toFixed(2)}%</span>
      </div>
      <div class="xai-bar"><span></span></div>
      <div class="xai-chip-body">
        <code>${escapeHtml(sub.fragment_smiles || "Fragment")}</code>
        <span class="xai-chip-count">${sub.atom_indices.length} atoms</span>
      </div>`;
    chip.addEventListener("click", () => {
      list.querySelectorAll(".xai-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      render3DMolecule(currentMol3D, sub.atom_indices);
      if (btnText) btnText.textContent = "Reset colours";
      isHighlightActive = true;
      $("mol3dContainer")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    list.appendChild(chip);
    requestAnimationFrame(() => setTimeout(() => {
      chip.querySelector(".xai-bar span").style.width = `${(sub.importance / maxImp) * 100}%`;
    }, 80));
  });

  if (btnToggle) {
    btnToggle.onclick = () => {
      isHighlightActive = !isHighlightActive;
      if (isHighlightActive) {
        render3DMolecule(currentMol3D, attribution.highlighted_atom_indices);
        if (btnText) btnText.textContent = "Reset colours";
      } else {
        render3DMolecule(currentMol3D, null);
        list.querySelectorAll(".xai-chip").forEach(c => c.classList.remove("active"));
        if (btnText) btnText.textContent = "Highlight key atoms";
      }
    };
  }
}

/* ─── Lead optimisation ───────────────────────────────────── */
function renderLeadOptimization(suggestions, prediction) {
  const container = $("optContainer");
  const list = $("optSuggestionsList");
  if (!container || !list) return;
  if (prediction !== "Inactive" || !suggestions?.length) { container.hidden = true; return; }

  container.hidden = false;
  list.innerHTML = suggestions.map((item, idx) => `
    <article class="opt-card" style="animation: rise .5s ${idx * 80}ms var(--ease) both">
      <div class="opt-card-header">
        <span class="opt-card-number">${idx + 1}</span>
        <h4 class="opt-card-title">${escapeHtml(item.title)}</h4>
        <span class="opt-card-impact">${escapeHtml(item.impact)}</span>
      </div>
      <p class="opt-card-rationale">${escapeHtml(item.rationale)}</p>
      <div class="opt-card-footer">
        <div><strong>Model driver:</strong> ${escapeHtml(item.target_feature)}</div>
        ${item.example_transformation ? `<div><strong>Example:</strong> ${escapeHtml(item.example_transformation)}</div>` : ""}
      </div>
    </article>`).join("");
}

/* ─── Single prediction ───────────────────────────────────── */
function setGauge(value, isActive) {
  const fill = $("gaugeFill");
  const label = $("gaugeValue");
  const gauge = $("gauge");
  const circumference = 2 * Math.PI * 50;
  if (fill) {
    fill.style.strokeDasharray = `${circumference}`;
    fill.style.strokeDashoffset = `${circumference}`;
    fill.style.stroke = isActive ? "var(--primary)" : "var(--rose)";
    requestAnimationFrame(() => setTimeout(() => {
      fill.style.strokeDashoffset = `${circumference * (1 - value)}`;
    }, 60));
  }
  if (gauge) gauge.style.setProperty("--value", value);
  if (label) animateNumber(label, value * 100, 1, 1100, "%");
}

function initSinglePrediction() {
  const input = $("smilesInput");
  const btnPredict = $("btnPredict");
  const errorBox = $("inputError");
  const empty = $("resultEmpty");
  const body = $("resultBody");
  const loading = $("resultLoading");
  const loadingStep = $("loadingStep");
  if (!input || !btnPredict) return;

  const showError = (msg) => { errorBox.textContent = msg; errorBox.classList.add("visible"); };
  const hideError = () => errorBox.classList.remove("visible");

  $("btnExample")?.addEventListener("click", () => {
    input.value = EXAMPLES[exampleIdx++ % EXAMPLES.length];
    hideError();
    input.focus();
  });

  document.querySelectorAll(".qchip").forEach(chip => chip.addEventListener("click", () => {
    input.value = chip.dataset.value;
    hideError();
    btnPredict.click();
  }));

  $("btnClear")?.addEventListener("click", () => {
    input.value = "";
    hideError();
    empty.hidden = false;
    body.hidden = true;
    loading.hidden = true;
    if (viewer3D) { viewer3D.clear(); viewer3D.render(); }
    const stageEmpty = $("stageEmpty");
    if (stageEmpty) {
      stageEmpty.hidden = false;
      stageEmpty.querySelector("strong").textContent = "No structure loaded";
      stageEmpty.querySelector("p").textContent = "Run a prediction to render a force-field optimised 3D conformer.";
    }
    $("viewerTools").hidden = true;
    $("atomLegend").hidden = true;
    $("xaiContainer").hidden = true;
    $("optContainer").hidden = true;
  });

  input.addEventListener("keydown", (e) => {
    if (e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); btnPredict.click(); }
  });

  $("btnToggleSpin")?.addEventListener("click", () => setSpin(!isSpinning));
  $("btnResetView")?.addEventListener("click", () => {
    if (!viewer3D) return;
    viewer3D.zoomTo(); viewer3D.zoom(1.1); viewer3D.render();
  });
  $("btnSnapshot")?.addEventListener("click", () => {
    if (!viewer3D) return;
    const link = document.createElement("a");
    link.href = viewer3D.pngURI();
    link.download = `biopredict_${Date.now()}.png`;
    link.click();
    toast("Snapshot saved");
  });

  document.querySelectorAll("#styleSeg .seg-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("#styleSeg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
    if (currentMol3D) render3DMolecule(currentMol3D, currentHighlight);
  }));

  $("btnCopySmiles")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("resSmiles").textContent); toast("SMILES copied"); }
    catch { toast("Copy not available"); }
  });

  const steps = ["Resolving molecule…", "Generating Morgan fingerprint…", "Running XGBoost inference…", "Computing atom attribution…", "Building 3D conformer…"];

  btnPredict.addEventListener("click", async () => {
    const value = input.value.trim();
    if (!value) { showError("Please enter a molecule name or SMILES string."); input.focus(); return; }
    hideError();

    $("stageEmpty").hidden = true;
    loading.hidden = false;
    btnPredict.disabled = true;
    setButtonContent(btnPredict, "loader-circle", "Analysing…");
    btnPredict.querySelector("svg")?.classList.add("spin");
    let s = 0;
    loadingStep.textContent = steps[0];
    const stepTimer = setInterval(() => { s = (s + 1) % steps.length; loadingStep.textContent = steps[s]; }, 900);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: value })
      });
      const data = await res.json();
      if (!res.ok || data.detail) throw new Error(data.detail || `Server error (${res.status})`);

      const isActive = data.prediction === "Active";
      const badge = $("predBadge");
      badge.textContent = data.prediction;
      badge.className = `badge ${isActive ? "badge-active" : "badge-inactive"}`;

      $("resMolName").textContent = data.molecule_name || value;
      $("resModel").textContent = data.model || "XGBoost";
      const info = data.mol_info || {};
      $("resFormula").textContent = info.formula || "—";
      $("resMW").textContent = info.mol_weight ? `${info.mol_weight} g/mol` : "—";
      $("resAtoms").textContent = info.num_atoms ?? "—";
      $("resBonds").textContent = info.num_bonds ?? "—";
      $("resSmiles").textContent = data.smiles || "—";

      empty.hidden = true;
      body.hidden = false;
      body.style.animation = "none";
      void body.offsetWidth;
      body.style.animation = "rise .6s var(--ease) both";

      const score = (data.score !== null && data.score !== undefined) ? Number(data.score) : 0;
      setGauge(Math.max(0, Math.min(1, score)), isActive);

      currentMol3D = data.mol_3d || "";
      currentAttribution = data.atom_attribution || null;
      render3DMolecule(currentMol3D);
      renderXAI(currentAttribution);
      renderLeadOptimization(data.lead_optimization, data.prediction);
    } catch (err) {
      showError(err.message || "Failed to predict molecule.");
      if (!currentMol3D) $("stageEmpty").hidden = false;
    } finally {
      clearInterval(stepTimer);
      loading.hidden = true;
      btnPredict.disabled = false;
      setButtonContent(btnPredict, "zap", "Predict bioactivity");
    }
  });
}

/* ─── Batch screening ─────────────────────────────────────── */
function initBatchPrediction() {
  const dropZone = $("dropZone");
  const fileInput = $("batchFileInput");
  const fileInfo = $("fileInfo");
  const fileName = $("fileName");
  const btnRun = $("btnRunBatch");
  const batchError = $("batchError");
  const results = $("batchResults");
  const tbody = $("batchTableBody");
  const progress = $("batchProgress");
  if (!dropZone || !fileInput) return;

  let selectedFile = null;
  let activeFilter = "all";

  const showError = (msg) => { batchError.textContent = msg; batchError.classList.add("visible"); };

  $("btnBrowse").addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  ["dragenter", "dragover"].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove("dragging")));
  dropZone.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener("change", (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

  $("btnRemoveFile").addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";
    fileInfo.hidden = true;
    btnRun.disabled = true;
  });

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) { showError("Please upload a valid .csv file."); return; }
    batchError.classList.remove("visible");
    selectedFile = file;
    fileName.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
    fileInfo.hidden = false;
    btnRun.disabled = false;
  }

  function renderRows() {
    if (!batchDataCache) return;
    const q = ($("batchSearch").value || "").trim().toLowerCase();
    const rows = batchDataCache.results.filter(r => {
      if (activeFilter === "error" && r.status === "ok") return false;
      if (activeFilter !== "all" && activeFilter !== "error" && r.prediction !== activeFilter) return false;
      return !q || String(r.smiles).toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">No rows match this filter.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.slice(0, 500).map((r, i) => {
      const status = r.status === "ok"
        ? `<span class="st-ok">Valid</span>`
        : `<span class="st-err" title="${escapeHtml(r.error || "Invalid SMILES")}">Error</span>`;
      const smiles = String(r.smiles || "");
      const short = smiles.length > 34 ? escapeHtml(smiles.slice(0, 34)) + "…" : escapeHtml(smiles);
      const pred = r.prediction
        ? `<span class="badge badge-sm ${r.prediction === "Active" ? "badge-active" : "badge-inactive"}">${r.prediction}</span>` : "—";
      const score = (r.score !== null && r.score !== undefined)
        ? `<div class="score-cell ${r.prediction === "Active" ? "" : "inactive"}"><div class="score-track"><span style="width:${(r.score * 100).toFixed(1)}%"></span></div>${(r.score * 100).toFixed(1)}%</div>`
        : "—";
      return `<tr class="row-in" style="animation-delay:${Math.min(i, 20) * 25}ms">
        <td>${r.row}</td><td><code title="${escapeHtml(smiles)}">${short}</code></td>
        <td>${status}</td><td>${pred}</td><td>${score}</td></tr>`;
    }).join("");
  }

  document.querySelectorAll("#batchFilters .seg-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("#batchFilters .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderRows();
  }));
  $("batchSearch").addEventListener("input", renderRows);

  btnRun.addEventListener("click", async () => {
    if (!selectedFile) return;
    btnRun.disabled = true;
    setButtonContent(btnRun, "loader-circle", "Screening library…");
    btnRun.querySelector("svg")?.classList.add("spin");
    progress.hidden = false;
    batchError.classList.remove("visible");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/predict_batch`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Batch prediction failed.");
      batchDataCache = data;

      const active = data.results.filter(r => r.prediction === "Active").length;
      const inactive = data.results.filter(r => r.prediction === "Inactive").length;
      const valid = active + inactive;
      const total = data.total_rows || data.results.length;

      animateNumber($("statTotal"), total, 0, 900);
      animateNumber($("statActive"), active, 0, 900);
      animateNumber($("statInactive"), inactive, 0, 900);
      animateNumber($("statErrors"), data.invalid_rows || 0, 0, 900);
      animateNumber($("statHitRate"), valid ? (active / valid) * 100 : 0, 1, 900, "%");

      const donut = $("donut");
      if (donut && total) {
        donut.style.setProperty("--active", (active / total) * 100);
        donut.style.setProperty("--inactive", (inactive / total) * 100);
      }

      results.hidden = false;
      renderRows();
      toast(`Screened ${total} molecules`);
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showError(err.message || "Failed to process batch screening.");
    } finally {
      progress.hidden = true;
      btnRun.disabled = !selectedFile;
      setButtonContent(btnRun, "play", "Start batch prediction");
    }
  });

  $("btnDownload").addEventListener("click", () => {
    if (!batchDataCache?.results) return;
    const rows = [
      ["Row", "SMILES", "Status", "Prediction", "Confidence_Score", "Error"],
      ...batchDataCache.results.map(r => [
        r.row, `"${r.smiles}"`, r.status, r.prediction || "", r.score ?? "", `"${r.error || ""}"`
      ])
    ];
    const blob = new Blob([rows.map(e => e.join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `biopredict_results_${Date.now()}.csv`;
    link.click();
  });
}

/* ─── Benchmark ───────────────────────────────────────────── */
async function initBenchmark() {
  document.querySelectorAll("#splitSeg .seg-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("#splitSeg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderBenchmark(btn.dataset.split);
  }));

  try {
    const res = await fetch(`${API_BASE}/models`);
    modelsCache = await res.json();
    renderBenchmark("cv");
  } catch (err) {
    const tbody = $("cvMetricsBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="muted-cell">Metrics unavailable — is the API running?</td></tr>`;
    const bars = $("benchBars");
    if (bars) bars.innerHTML = `<p class="muted-cell">Metrics unavailable.</p>`;
  }
}

function renderBenchmark(split) {
  if (!modelsCache) return;
  const list = (split === "holdout" ? modelsCache.holdout_results : modelsCache.cv_results) || [];
  if (!list.length) return;
  const sorted = [...list].sort((a, b) => (b.AUC || 0) - (a.AUC || 0));
  const pct = (v) => (v !== undefined && v !== null) ? (v * 100).toFixed(2) + "%" : "—";

  const bars = $("benchBars");
  bars.innerHTML = sorted.map(m => {
    const win = m.Model === "XGBoost";
    return `<div class="bar-row ${win ? "winner" : ""}">
      <span class="bar-name">${win ? '<i data-lucide="crown" class="crown"></i>' : ""}${escapeHtml(m.Model)}</span>
      <div class="bar-tracks">
        <div class="bar-track auc"><span data-w="${(m.AUC || 0) * 100}"></span></div>
        <div class="bar-track acc"><span data-w="${(m.ACC || 0) * 100}"></span></div>
      </div>
      <span class="bar-val">${((m.AUC || 0) * 100).toFixed(1)}</span>
    </div>`;
  }).join("");
  refreshIcons();
  requestAnimationFrame(() => setTimeout(() => {
    bars.querySelectorAll(".bar-track span").forEach(s => { s.style.width = s.dataset.w + "%"; });
  }, 60));

  $("cvMetricsBody").innerHTML = sorted.map(m => {
    const win = m.Model === "XGBoost";
    return `<tr class="${win ? "row-winner" : ""}">
      <td><strong>${escapeHtml(m.Model)}</strong>${win ? '<span class="winner-tag">Best</span>' : ""}</td>
      <td>${pct(m.ACC)}</td><td>${pct(m.Precision)}</td><td>${pct(m.SEN)}</td>
      <td>${pct(m.SPC)}</td><td>${pct(m.F1)}</td><td><strong>${pct(m.AUC)}</strong></td></tr>`;
  }).join("");

  const best = list.find(m => m.Model === "XGBoost") || sorted[0];
  $("cmModel").textContent = best.Model;
  $("cmSplit").textContent = split === "holdout" ? "hold-out test set" : "cross-validation";
  let tn = best.TN, fp = best.FP, fn = best.FN, tp = best.TP;
  if (tp === undefined && modelsCache.confusion_matrices) {
    const key = split === "holdout" ? Object.keys(modelsCache.confusion_matrices).find(k => k.includes("holdout")) : "validation_cv";
    const cm = modelsCache.confusion_matrices[key]?.[best.Model];
    if (cm) [[tn, fp], [fn, tp]] = cm;
  }
  [["cmTN", tn], ["cmFP", fp], ["cmFN", fn], ["cmTP", tp]].forEach(([id, v]) => {
    const el = $(id)?.querySelector("strong");
    if (el) { if (typeof v === "number") animateNumber(el, v, 0, 900); else el.textContent = "—"; }
  });
}

/* ─── Figure lightbox ─────────────────────────────────────── */
function initLightbox() {
  const dlg = $("lightbox");
  if (!dlg) return;
  document.querySelectorAll(".fig").forEach(fig => fig.addEventListener("click", () => {
    $("lightboxImg").src = fig.dataset.src;
    $("lightboxImg").alt = fig.dataset.title;
    $("lightboxTitle").textContent = fig.dataset.title;
    dlg.showModal();
  }));
  $("lightboxClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
