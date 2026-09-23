import { MAX_SOURCE_CHARS_PER_REQUEST, MIN_SOURCE_CHARS, type GenerationKind, type GenerationOptions } from '../shared/generation';
import { authHeaders } from './supabase';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1500, 3000];

export const MAX_PDF_SIZE_BYTES = 3 * 1024 * 1024;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function errorFrom(res: Response, label: string) {
  if (res.status === 401) return new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  const body = await res.text();
  let message = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.error === 'string') message = parsed.error;
  } catch {
    // non-JSON body: show it raw
  }
  return new Error(`${label} (${res.status}): ${message}`);
}

async function postJson(path: string, body: unknown) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
}

async function callGenerate(kind: GenerationKind, sourceText: string, options: GenerationOptions) {
  let attempt = 0;
  let res = await postJson('/api/generate', { kind, sourceText, options });

  while (!res.ok) {
    if (!RETRYABLE_STATUS_CODES.has(res.status) || attempt >= RETRY_DELAYS_MS.length) {
      throw await errorFrom(res, 'API 오류');
    }
    await delay(RETRY_DELAYS_MS[attempt]);
    attempt += 1;
    res = await postJson('/api/generate', { kind, sourceText, options });
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('응답에서 텍스트를 찾을 수 없습니다.');
  return JSON.parse(text);
}

export function validateSourceText(sourceText: string) {
  const trimmed = sourceText.trim();
  if (!trimmed) return '학습 자료를 먼저 입력해주세요.';
  if (trimmed.length < MIN_SOURCE_CHARS) return '학습 자료가 너무 짧습니다. 조금 더 자세한 내용을 입력해주세요.';
  return '';
}

function splitIntoChunks(text: string, maxChars: number) {
  const paragraphs = text
    .split(/\n{2,}/)
    .flatMap(p => (p.length > maxChars ? p.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, 'g')) ?? [] : [p]));
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function distributeCount(total: number, parts: number) {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => Math.max(base + (i < remainder ? 1 : 0), 1));
}

export async function generateChunked<T>(kind: GenerationKind, sourceText: string, options: GenerationOptions): Promise<T[]> {
  const chunks = splitIntoChunks(sourceText.trim(), MAX_SOURCE_CHARS_PER_REQUEST)
    .filter(chunk => chunk.trim().length >= MIN_SOURCE_CHARS);
  const counts = distributeCount(options.questionCount, chunks.length);
  const results = await Promise.all(
    chunks.map((chunk, i) => callGenerate(kind, chunk, { ...options, questionCount: counts[i] })),
  );
  return (results as T[][]).flat().slice(0, options.questionCount);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extractPdf(file: File): Promise<{ text: string; source: 'text-layer' | 'ocr' }> {
  const res = await postJson('/api/extract-pdf', { fileBase64: await fileToBase64(file) });
  if (!res.ok) throw await errorFrom(res, 'PDF 처리 오류');
  return res.json();
}
