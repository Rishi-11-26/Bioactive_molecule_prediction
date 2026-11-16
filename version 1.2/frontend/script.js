/* ============================================================
   BioPredict — script.js
   Full-Stack Inference, 3D Molecular Viewer & Batch Screening
   Clean, Minimal, Beginner-Friendly Vanilla JavaScript
   ============================================================ */

// Dynamic Backend URL: auto-detects localhost or deployed origin
const API_BASE = (window.location.protocol === "file:")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

// Curated example molecules (both standard drug names and chemical SMILES strings)
const EXAMPLES = [
  // ── Standard Molecule / Drug Names ──
  "Aspirin",
  "Celecoxib",
  "Ibuprofen",
  "Paracetamol",
  "Diclofenac",
  "Naproxen",
  "Meloxicam",
  "Caffeine",

  // ── Chemical SMILES Strings ──
  "Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1",  // Celecoxib (Potent COX-2 Inhibitor)
  "CC(=O)Oc1ccccc1C(=O)O",                                // Aspirin (Acetylsalicylic Acid)
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O",                           // Ibuprofen
  "O=C(O)Cc1ccccc1Nc1c(Cl)cccc1Cl",                       // Diclofenac
  "O=S(=O)(c1ccc(C2=C(c3ccccc3)C(=O)OC2)cc1)C",           // Rofecoxib (Vioxx)
  "Cc1nc(NC(=O)c2c(O)c3ccccc3s(=O)(=O)n2C)cs1",           // Meloxicam
  "COc1ccc2cc(C(C)C(=O)O)ccc2c1",                          // Naproxen
  "Cn1cnc2c1c(=O)n(C)c(=O)n2C",                            // Caffeine
  "c1ccccc1",                                              // Benzene
  "CCO"                                                    // Ethanol
];

let exampleIdx = 0;
let viewer3D = null;
let isSpinning = true;
let batchDataCache = null;

// ─── App Startup ─────────────────────────────────────────────
function startApp() {
  initHealthCheck();
  initSinglePrediction();
  initBatchPrediction();
  loadBenchmarkMetrics();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

// Periodic background health check (every 10s)
setInterval(initHealthCheck, 10000);

// ─── 1. Backend Health Check ─────────────────────────────────
async function initHealthCheck() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    let fetchOpts = {};
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      fetchOpts.signal = AbortSignal.timeout(4000);
    }
    const res = await fetch(`${API_BASE}/health`, fetchOpts);
    if (res.ok) {
      if (dot) dot.className = "status-dot online";
      if (text) text.textContent = "Online";
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (dot) dot.className = "status-dot offline";
    if (text) text.textContent = "Offline";
  }
}

// ─── 2. 3D Molecular Viewer (3Dmol.js) ───────────────────────
function render3DMolecule(mol3dBlock) {
  const container = document.getElementById("mol3dContainer");
  if (!container) return;

  if (!window.$3Dmol) {
    container.innerHTML = "<p style='padding:20px; text-align:center; color:#64748b;'>3Dmol.js loading... Please check internet connection.</p>";
    return;
  }

  // Clear previous viewer instance
  container.innerHTML = "";
  viewer3D = $3Dmol.createViewer(container, { backgroundColor: "white" });

  if (!mol3dBlock || !mol3dBlock.trim()) {
    container.innerHTML = "<p style='padding:20px; text-align:center; color:#64748b;'>3D coordinate model not available for this compound.</p>";
    return;
  }

  // Add 3D molecular coordinates in MOL/SDF format
  viewer3D.addModel(mol3dBlock, "sdf");

  // Ball-and-Stick Styling:
  // - Spheres: Atoms (Jmol/CPK color code)
  // - Sticks: Chemical Bonds
  viewer3D.setStyle({}, {
    stick: { radius: 0.15, colorscheme: "Jmol" },
    sphere: { scale: 0.28, colorscheme: "Jmol" }
  });

  viewer3D.zoomTo();
  viewer3D.render();

  // Subtle auto-rotation
  isSpinning = true;
  viewer3D.spin(true);

  const btnToggleSpin = document.getElementById("btnToggleSpin");
  if (btnToggleSpin) {
    btnToggleSpin.textContent = "Pause Rotation";
  }

  // Pause rotation on mouse drag / interaction
  container.onmousedown = () => {
    if (viewer3D && isSpinning) {
      viewer3D.spin(false);
      isSpinning = false;
      if (btnToggleSpin) btnToggleSpin.textContent = "Resume Rotation";
    }
  };
}

// ─── 3. Single Molecule Prediction ───────────────────────────
function initSinglePrediction() {
  const smilesInput = document.getElementById("smilesInput");
  const btnPredict  = document.getElementById("btnPredict");
  const btnExample  = document.getElementById("btnExample");
  const btnClear    = document.getElementById("btnClear");
  const errorBox    = document.getElementById("inputError");

  const stateEmpty    = document.getElementById("resultEmpty");
  const stateLoading  = document.getElementById("resultLoading");
  const resultBody    = document.getElementById("resultBody");
  const btnToggleSpin = document.getElementById("btnToggleSpin");

  if (!smilesInput || !btnPredict) return;

  // Load Example (cycles through drug names & SMILES)
  if (btnExample) {
    btnExample.addEventListener("click", () => {
      const ex = EXAMPLES[exampleIdx % EXAMPLES.length];
      exampleIdx++;
      smilesInput.value = ex;
      if (errorBox) errorBox.classList.remove("visible");
    });
  }

  // Clear Input & Results
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      smilesInput.value = "";
      if (errorBox) errorBox.classList.remove("visible");
      if (stateEmpty) stateEmpty.style.display = "flex";
      if (stateLoading) stateLoading.style.display = "none";
      if (resultBody) resultBody.style.display = "none";
      if (viewer3D) viewer3D.clear();
    });
  }

  // Toggle 3D Auto-Rotation
  if (btnToggleSpin) {
    btnToggleSpin.addEventListener("click", () => {
      if (!viewer3D) return;
      isSpinning = !isSpinning;
      viewer3D.spin(isSpinning);
      btnToggleSpin.textContent = isSpinning ? "Pause Rotation" : "Resume Rotation";
    });
  }

  // Predict Bioactivity
  btnPredict.addEventListener("click", async () => {
    const inputVal = smilesInput.value.trim();
    if (!inputVal) {
      if (errorBox) {
        errorBox.textContent = "Please enter a molecule name or SMILES string.";
        errorBox.classList.add("visible");
      }
      return;
    }
    if (errorBox) errorBox.classList.remove("visible");

    // Display Loading State
    if (stateEmpty) stateEmpty.style.display = "none";
    if (stateLoading) stateLoading.style.display = "flex";
    if (resultBody) resultBody.style.display = "none";
    btnPredict.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: inputVal })
      });

      const data = await res.json();
      if (!res.ok || data.detail) {
        throw new Error(data.detail || `Server error (${res.status})`);
      }

      // 1. Prediction Label & Activity Badge
      const isActive = data.prediction === "Active";
      const badge = document.getElementById("predBadge");
      if (badge) {
        badge.textContent = data.prediction;
        badge.className = `badge ${isActive ? 'badge-active' : 'badge-inactive'}`;
      }

      // 2. Confidence Score
      const scoreEl = document.getElementById("predScore");
      if (scoreEl) {
        scoreEl.textContent = (data.score !== null && data.score !== undefined)
          ? `Confidence: ${(data.score * 100).toFixed(1)}%`
          : "";
      }

      // 3. Molecule Properties
      const nameEl = document.getElementById("resMolName");
      if (nameEl) nameEl.textContent = data.molecule_name || inputVal;

      const modelEl = document.getElementById("resModel");
      if (modelEl) modelEl.textContent = data.model || "XGBoost";

      const mwEl = document.getElementById("resMW");
      if (mwEl) {
        mwEl.textContent = data.mol_info?.mol_weight
          ? `${data.mol_info.mol_weight} g/mol`
          : "N/A";
      }

      const smilesEl = document.getElementById("resSmiles");
      if (smilesEl) smilesEl.textContent = data.smiles || "-";

      // 4. Render 3D Model
      render3DMolecule(data.mol_3d);

      if (stateLoading) stateLoading.style.display = "none";
      if (resultBody) resultBody.style.display = "block";
    } catch (err) {
      if (stateLoading) stateLoading.style.display = "none";
      if (stateEmpty) stateEmpty.style.display = "flex";
      if (errorBox) {
        errorBox.textContent = err.message || "Failed to predict molecule.";
        errorBox.classList.add("visible");
      }
    } finally {
      btnPredict.disabled = false;
    }
  });
}

// ─── 4. Batch Screening (CSV) ────────────────────────────────
function initBatchPrediction() {
  const dropZone       = document.getElementById("dropZone");
  const fileInput      = document.getElementById("batchFileInput");
  const btnBrowse      = document.getElementById("btnBrowse");
  const fileInfo       = document.getElementById("fileInfo");
  const fileName       = document.getElementById("fileName");
  const btnRunBatch    = document.getElementById("btnRunBatch");
  const batchError     = document.getElementById("batchError");
  const batchResults   = document.getElementById("batchResults");
  const batchTableBody = document.getElementById("batchTableBody");
  const btnDownload    = document.getElementById("btnDownload");

  let selectedFile = null;

  btnBrowse.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", (e) => {
    if (e.target !== btnBrowse) fileInput.click();
  });

  // Drag and drop events
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.style.borderColor = "var(--primary)"; });
  dropZone.addEventListener("dragleave", () => { dropZone.style.borderColor = "#cbd5e1"; });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#cbd5e1";
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      batchError.textContent = "Please upload a valid .csv file.";
      batchError.classList.add("visible");
      return;
    }
    batchError.classList.remove("visible");
    selectedFile = file;
    fileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileInfo.style.display = "flex";
  }

  // Run Batch Screening
  btnRunBatch.addEventListener("click", async () => {
    if (!selectedFile) return;
    btnRunBatch.disabled = true;
    btnRunBatch.textContent = "Processing Screening...";
    batchError.classList.remove("visible");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/predict_batch`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Batch prediction failed.");

      batchDataCache = data;

      // Stats
      const activeCount = data.results.filter(r => r.prediction === "Active").length;
      const inactiveCount = data.results.filter(r => r.prediction === "Inactive").length;

      document.getElementById("statTotal").textContent = data.total_rows;
      document.getElementById("statActive").textContent = activeCount;
      document.getElementById("statInactive").textContent = inactiveCount;
      document.getElementById("statErrors").textContent = data.invalid_rows;

      // Render table rows
      batchTableBody.innerHTML = data.results.map(r => {
        const statusHtml = r.status === 'ok'
          ? '<span class="badge-status-valid">● Valid</span>'
          : `<span class="badge-status-error" data-tooltip="${escapeHtml(r.error || 'Invalid SMILES')}" title="${escapeHtml(r.error || 'Invalid SMILES')}">● Error <span class="help-circle">?</span></span>`;

        return `
          <tr>
            <td>${r.row}</td>
            <td><code title="${escapeHtml(r.smiles)}">${r.smiles.length > 25 ? escapeHtml(r.smiles.substring(0, 25)) + '…' : escapeHtml(r.smiles)}</code></td>
            <td>${statusHtml}</td>
            <td>
              ${r.prediction ? `<span class="badge ${r.prediction === 'Active' ? 'badge-active' : 'badge-inactive'}" style="font-size:0.75rem;padding:2px 8px;">${r.prediction}</span>` : '-'}
            </td>
            <td>${r.score !== null ? (r.score * 100).toFixed(1) + '%' : '-'}</td>
          </tr>
        `;
      }).join("");

      batchResults.style.display = "block";
    } catch (err) {
      batchError.textContent = err.message || "Failed to process batch screening.";
      batchError.classList.add("visible");
    } finally {
      btnRunBatch.disabled = false;
      btnRunBatch.textContent = "Start Batch Prediction";
    }
  });

  // Download CSV Results
  btnDownload.addEventListener("click", () => {
    if (!batchDataCache?.results) return;
    const csvRows = [
      ["Row", "SMILES", "Status", "Prediction", "Confidence_Score", "Error"],
      ...batchDataCache.results.map(r => [
        r.row, `"${r.smiles}"`, r.status, r.prediction || "", r.score || "", `"${r.error || ''}"`
      ])
    ];
    const blob = new Blob([csvRows.map(e => e.join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `biopredict_results_${Date.now()}.csv`;
    link.click();
  });
}

// ─── 5. Model Benchmark (Cross-Validation Table) ─────────────
async function loadBenchmarkMetrics() {
  const tbody = document.getElementById("cvMetricsBody");
  if (!tbody) return;
  try {
    const res = await fetch(`${API_BASE}/models`);
    const data = await res.json();
    if (!data.cv_results?.length) return;

    tbody.innerHTML = data.cv_results.map(m => {
      const isWinner = m.Model === "XGBoost";
      const fmt = (v) => v !== undefined ? (v * 100).toFixed(2) + '%' : 'N/A';
      return `
        <tr class="${isWinner ? 'row-winner' : ''}">
          <td><strong>${m.Model}</strong> ${isWinner ? '★' : ''}</td>
          <td>${fmt(m.ACC)}</td>
          <td>${fmt(m.Precision)}</td>
          <td>${fmt(m.SEN)}</td>
          <td>${fmt(m.SPC)}</td>
          <td>${fmt(m.F1)}</td>
          <td><strong>${fmt(m.AUC)}</strong></td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load model metrics:", err);
  }
}

// ─── Simple Helper ───────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
