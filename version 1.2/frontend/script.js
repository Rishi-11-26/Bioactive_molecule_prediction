/* ============================================================
   BioPredict — script.js
   Clean, Readable Vanilla JavaScript for Undergrad Viva & Defense
   ============================================================ */

// Dynamic Backend URL: auto-detects localhost or deployed origin
const API_BASE = (window.location.protocol === "file:")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

// Curated example molecules
const EXAMPLES = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
  { name: "Celecoxib analog", smiles: "CS(=O)(=O)c1ccc(-c2csc(CC(=O)O)c2-c2ccc(F)cc2)cc1" },
  { name: "Ethanol", smiles: "CCO" },
  { name: "Benzene", smiles: "c1ccccc1" }
];
let exampleIdx = 0;
let batchDataCache = null;

// ─── Initialization on DOM Load ──────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initHealthCheck();
  initSinglePrediction();
  initBatchPrediction();
  loadBenchmarkMetrics();
});

// ─── 1. Health Check ─────────────────────────────────────────
async function initHealthCheck() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className = "status-dot online";
      text.textContent = "Online";
    } else {
      throw new Error();
    }
  } catch {
    dot.className = "status-dot offline";
    text.textContent = "Offline";
  }
}

// ─── 2. Single Molecule Prediction ───────────────────────────
function initSinglePrediction() {
  const smilesInput = document.getElementById("smilesInput");
  const btnPredict  = document.getElementById("btnPredict");
  const btnExample  = document.getElementById("btnExample");
  const btnClear    = document.getElementById("btnClear");
  const errorBox    = document.getElementById("inputError");

  const stateEmpty   = document.getElementById("resultEmpty");
  const stateLoading = document.getElementById("resultLoading");
  const resultBody   = document.getElementById("resultBody");

  // Load Example
  btnExample.addEventListener("click", () => {
    const ex = EXAMPLES[exampleIdx % EXAMPLES.length];
    smilesInput.value = ex.smiles;
    exampleIdx++;
    errorBox.classList.remove("visible");
  });

  // Clear
  btnClear.addEventListener("click", () => {
    smilesInput.value = "";
    errorBox.classList.remove("visible");
    stateEmpty.style.display = "flex";
    stateLoading.style.display = "none";
    resultBody.style.display = "none";
  });

  // Predict
  btnPredict.addEventListener("click", async () => {
    const smiles = smilesInput.value.trim();
    if (!smiles) {
      errorBox.textContent = "Please enter a valid SMILES string.";
      errorBox.classList.add("visible");
      return;
    }
    errorBox.classList.remove("visible");

    // Show Loading
    stateEmpty.style.display = "none";
    stateLoading.style.display = "flex";
    resultBody.style.display = "none";
    btnPredict.disabled = true;

    try {
      // Concurrently run inference and 2D structure generation
      const [predRes, vizRes] = await Promise.all([
        fetch(`${API_BASE}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smiles })
        }).then(r => r.json()),

        fetch(`${API_BASE}/visualize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smiles, width: 380, height: 220 })
        }).then(r => r.json()).catch(() => null)
      ]);

      if (predRes.detail) throw new Error(predRes.detail);

      // Display Prediction
      const isActive = predRes.prediction === "Active";
      const badge = document.getElementById("predBadge");
      badge.textContent = predRes.prediction;
      badge.className = `badge ${isActive ? 'badge-active' : 'badge-inactive'}`;

      document.getElementById("predScore").textContent = 
        predRes.score !== null ? `Confidence: ${(predRes.score * 100).toFixed(1)}%` : "";
      
      const molNameEl = document.getElementById("resMolName");
      if (molNameEl) {
        molNameEl.textContent = predRes.molecule_name || "Unknown Compound";
      }

      document.getElementById("resModel").textContent = predRes.model;
      document.getElementById("resMW").textContent = 
        predRes.mol_info?.mol_weight ? `${predRes.mol_info.mol_weight} g/mol` : "N/A";
      document.getElementById("resSmiles").textContent = predRes.smiles;

      // Render 2D SVG
      const molSvg = document.getElementById("molSvg");
      molSvg.innerHTML = vizRes?.svg || "<p style='color:#64748b;'>Structure display not available</p>";

      stateLoading.style.display = "none";
      resultBody.style.display = "block";
    } catch (err) {
      stateLoading.style.display = "none";
      stateEmpty.style.display = "flex";
      errorBox.textContent = err.message || "Failed to predict molecule.";
      errorBox.classList.add("visible");
    } finally {
      btnPredict.disabled = false;
    }
  });
}

// ─── 3. Batch Screening (CSV) ────────────────────────────────
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
      batchError.textContent = err.message;
      batchError.classList.add("visible");
    } finally {
      btnRunBatch.disabled = false;
      btnRunBatch.textContent = "Start Batch Prediction";
    }
  });

  // Download CSV
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

// ─── 4. Model Benchmark (Cross-Validation Table) ─────────────
async function loadBenchmarkMetrics() {
  const tbody = document.getElementById("cvMetricsBody");
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

// ─── Simple Helper ────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
