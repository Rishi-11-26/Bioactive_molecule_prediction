/* ============================================================
   BioPredict — api.js
   API Service Layer — all fetch calls to the FastAPI backend
   ============================================================

   Usage: import functions from this file in script.js.
   Every function returns the parsed JSON response or throws an
   error with a human-readable message.
*/

// ─── API Base URL ─────────────────────────────────────────────────────────────
// When served by FastAPI at /app/, origin = server address.
// When opened directly as file://, fall back to localhost:8000.
const API_BASE = (window.location.protocol === "file:")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

// ─── Helper: parse error from FastAPI response ────────────────────────────────
async function parseErrorMessage(response) {
  try {
    const body = await response.json();
    return body.detail || `Server error (HTTP ${response.status})`;
  } catch {
    return `Server error (HTTP ${response.status})`;
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────
async function apiHealth() {
  const res = await fetch(`${API_BASE}/health`, {
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

// ─── Single Molecule Prediction ───────────────────────────────────────────────
async function apiPredict(smiles, name = "") {
  const payload = { smiles: smiles.trim() };
  if (name && name.trim()) payload.name = name.trim();
  const res = await fetch(`${API_BASE}/predict`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

// ─── Batch Prediction ─────────────────────────────────────────────────────────
async function apiBatchPredict(csvFile) {
  const formData = new FormData();
  formData.append("file", csvFile);

  const res = await fetch(`${API_BASE}/predict_batch`, {
    method: "POST",
    body:   formData
    // Note: do NOT set Content-Type header — browser sets it with boundary automatically
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

// ─── Molecular Visualization (SVG) ───────────────────────────────────────────
async function apiVisualize(smiles, width = 400, height = 300) {
  const res = await fetch(`${API_BASE}/visualize`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ smiles: smiles.trim(), width, height })
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

// ─── Model Comparison Data ────────────────────────────────────────────────────
async function apiModels() {
  const res = await fetch(`${API_BASE}/models`, {
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}
