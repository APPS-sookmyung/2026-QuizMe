// Tried in order; the next model is used only when the previous one is overloaded.
// The pinned fallbacks may be retired by Google over time — check the model list if they start returning 404.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
const OVERLOAD_STATUS_CODES = new Set([429, 500, 503]);

export type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export async function fetchGemini(apiKey: string, body: unknown) {
  const payload = JSON.stringify(body);
  let res: Response | undefined;

  for (const model of GEMINI_MODELS) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!OVERLOAD_STATUS_CODES.has(res.status)) return res;
    console.warn(`[gemini] ${model} returned ${res.status}, trying next model`);
  }

  return res!;
}
