// ─── E2R Service — BERT CWI + mT5 (HuggingFace Spaces) ──────────────────────
//
// The API is permanently hosted on HuggingFace Spaces — no Colab, no ngrok.
//
// HOW TO SET YOUR URL:
//   After running Step 8 in the notebook, copy the Space URL printed in the
//   output and paste it in your .env file:
//
//   REACT_APP_E2R_API_URL=https://your-username-sinhala-e2r-api.hf.space
//
//   The URL format is always:
//   https://{hf-username}-sinhala-e2r-api.hf.space
//   (underscores in username become hyphens in the URL)

const E2R_API_URL =
  process.env.REACT_APP_E2R_API_URL ||
  "https://DineshaPriyadarshani-sinhala-e2r-api.hf.space"; // replace until .env is set

const COMPLEXITY_THRESHOLD =
  parseFloat(process.env.REACT_APP_E2R_THRESHOLD) || 0.30;

// HF free CPU spaces are slower than Colab GPU — allow more time
const DEFAULT_TIMEOUT_MS = 60_000;

// No ngrok header needed — HF Spaces has proper CORS configured in app.py
const HEADERS = { "Content-Type": "application/json" };

// ─── Health check ─────────────────────────────────────────────────────────────
export const checkE2RHealth = async () => {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 8_000);
    const resp = await fetch(`${E2R_API_URL}/health`, {
      headers: HEADERS,
      signal: ctrl.signal,
    });
    clearTimeout(id);
    const data = await resp.json();
    return data.status === "ok";
  } catch {
    return false;
  }
};

// ─── Single paragraph ─────────────────────────────────────────────────────────
/**
 * Simplify one Sinhala paragraph via the HF Space (BERT CWI + mT5).
 * @returns {Promise<{ simplified, scoreBefore, scoreAfter, timeMs }>}
 */
export const callE2R = async (
  paragraph,
  complexityThreshold = COMPLEXITY_THRESHOLD
) => {
  const fallback = { simplified: paragraph, scoreBefore: 0, scoreAfter: 0, timeMs: 0 };
  if (!paragraph?.trim()) return fallback;

  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

    const resp = await fetch(`${E2R_API_URL}/simplify`, {
      method: "POST",
      headers: HEADERS,
      signal: ctrl.signal,
      body: JSON.stringify({
        text: paragraph,
        complexity_threshold: complexityThreshold,
        max_new_tokens: 256,
      }),
    });
    clearTimeout(id);

    if (!resp.ok) {
      console.error(`[E2R] HTTP ${resp.status}: ${await resp.text()}`);
      return fallback;
    }

    const data = await resp.json();
    console.log(`[E2R] ${data.score_before ?? "?"}% → ${data.score_after ?? "?"}% | ${data.time_ms}ms`);

    return {
      simplified: data.simplified || paragraph,
      scoreBefore: data.score_before ?? 0,
      scoreAfter: data.score_after ?? 0,
      timeMs: data.time_ms ?? 0,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[E2R] Timed out — HF free CPU cold start can be slow, retry in 30s");
    } else {
      console.error("[E2R] error:", err);
    }
    return fallback;
  }
};

// ─── Batch (whole document) ───────────────────────────────────────────────────
/**
 * Simplify multiple paragraphs in one API call (faster than looping callE2R).
 * @returns {Promise<string[]>}
 */
export const callE2RBatch = async (
  paragraphs,
  complexityThreshold = COMPLEXITY_THRESHOLD
) => {
  if (!paragraphs?.length) return [];

  try {
    const ctrl = new AbortController();
    // Scale timeout: each sentence ~10s on CPU free tier
    const timeoutMs = Math.min(300_000, paragraphs.length * 15_000);
    const id = setTimeout(() => ctrl.abort(), timeoutMs);

    const resp = await fetch(`${E2R_API_URL}/batch`, {
      method: "POST",
      headers: HEADERS,
      signal: ctrl.signal,
      body: JSON.stringify({
        texts: paragraphs,
        complexity_threshold: complexityThreshold,
        max_new_tokens: 256,
      }),
    });
    clearTimeout(id);

    if (!resp.ok) {
      console.error(`[E2R Batch] HTTP ${resp.status}: ${await resp.text()}`);
      return paragraphs;
    }

    const data = await resp.json();
    console.log(`[E2R Batch] ${data.count} paragraphs | ${data.time_ms}ms`);
    return data.results || paragraphs;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[E2R Batch] Timed out");
    } else {
      console.error("[E2R Batch] error:", err);
    }
    return paragraphs;
  }
};