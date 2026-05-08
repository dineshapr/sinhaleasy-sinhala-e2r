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

const HF_TOKEN = process.env.REACT_APP_HF_TOKEN_READ_ONLY;

// const HF_TOKEN = 'TOKEN_HARDCODED';

const E2R_API_URL = 'https://DineshaPriyadarshani-sinhala-e2r-api.hf.space';

const headers = {
  Authorization: `Bearer ${HF_TOKEN}`,
  'Content-Type': 'application/json',
};

const DEFAULT_TIMEOUT_MS = 120000; // 2 min (HF cold start safe)

// ─── Health Check ─────────────────────────────────────────────
export const checkE2RHealth = async () => {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 10000);

    const res = await fetch(`${E2R_API_URL}/health`, {
      headers,
      signal: ctrl.signal,
    });

    clearTimeout(id);
    const data = await res.json();

    return data.status === 'ok';
  } catch {
    return false;
  }
};

// ─── Batch Simplification (MAIN) ──────────────────────────────
export const callE2RBatch = async (paragraphs) => {
  if (!paragraphs?.length) return [];

  try {
    const ctrl = new AbortController();
    const timeoutMs = Math.min(300000, paragraphs.length * 15000);
    const id = setTimeout(() => ctrl.abort(), timeoutMs);

    const res = await fetch(`${E2R_API_URL}/batch`, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        texts: paragraphs,
      }),
    });

    clearTimeout(id);

    if (!res.ok) {
      console.error('[E2R Batch] HTTP', res.status);
      return paragraphs;
    }

    const data = await res.json();

    console.log('[E2R Batch]', data);

    return data.results || paragraphs;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[E2R Batch] Timeout');
    } else {
      console.error('[E2R Batch]', err);
    }
    return paragraphs;
  }
};