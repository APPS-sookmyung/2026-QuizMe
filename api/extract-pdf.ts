import { PDFParse } from 'pdf-parse';
import { authenticate } from './_auth';
import { fetchGemini, type GeminiResponse } from './_gemini';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: { fileBase64?: unknown } };
type Res = { status: (code: number) => Res; json: (body: unknown) => void };

const MIN_CHARS_PER_PAGE = 20;
const OCR_PROMPT = '이 PDF에 있는 모든 텍스트를 빠짐없이 그대로 추출해줘. 설명이나 요약 없이 원문 텍스트만 출력해.';

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

  const fileBase64 = req.body?.fileBase64;
  if (!fileBase64 || typeof fileBase64 !== 'string') {
    res.status(400).json({ error: 'fileBase64가 필요합니다.' });
    return;
  }

  const parser = new PDFParse({ data: Buffer.from(fileBase64, 'base64') });
  let textResult;
  try {
    textResult = await parser.getText();
  } catch {
    res.status(400).json({ error: 'PDF를 읽을 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식입니다.' });
    return;
  } finally {
    await parser.destroy();
  }

  const avgCharsPerPage = textResult.total > 0 ? textResult.text.length / textResult.total : 0;

  if (avgCharsPerPage >= MIN_CHARS_PER_PAGE) {
    res.status(200).json({ text: textResult.text, source: 'text-layer' });
    return;
  }

  const upstream = await fetchGemini(apiKey, {
    contents: [{
      role: 'user',
      parts: [
        { text: OCR_PROMPT },
        { inlineData: { mimeType: 'application/pdf', data: fileBase64 } },
      ],
    }],
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    res.status(upstream.status).json({ error: errText.slice(0, 200) });
    return;
  }

  const data = (await upstream.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    res.status(502).json({ error: 'PDF에서 텍스트를 추출하지 못했습니다.' });
    return;
  }

  res.status(200).json({ text, source: 'ocr' });
}
