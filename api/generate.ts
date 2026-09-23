import { authenticate } from './_auth.js';
import { fetchGemini } from './_gemini.js';
import { buildFlashcardPrompt, buildQuizPrompt, FLASHCARD_SCHEMA, parseGenerateRequest, quizSchema } from './_prompts.js';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Res = { status: (code: number) => Res; json: (body: unknown) => void };

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await authenticate(req.headers);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY가 서버에 설정되지 않았습니다.' });
    return;
  }

  const parsed = parseGenerateRequest(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }

  const isQuiz = parsed.kind === 'quiz';
  const upstream = await fetchGemini(apiKey, {
    contents: [{ role: 'user', parts: [{ text: isQuiz ? buildQuizPrompt(parsed) : buildFlashcardPrompt(parsed) }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: isQuiz ? quizSchema(parsed.options.questionTypes) : FLASHCARD_SCHEMA,
    },
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
