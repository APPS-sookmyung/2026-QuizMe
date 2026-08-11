import { useMemo, useState } from 'react';
import './styles.css';
import { QuizQuestionCard } from './components/QuizQuestionCard';
import { ResultSummary } from './components/ResultSummary';
import { SourceInputPanel } from './components/SourceInputPanel';
import type { QuizAppState, QuizQuestion } from './types/quiz';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function normalizeAnswerValue(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]/g, '')
    .replace(/\s+/g, '');
}

function getShortAnswerCandidates(question: QuizQuestion) {
  const collected: string[] = [];
  const addValue = (value?: string | string[]) => {
    if (!value) return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach(item => {
      const text = String(item).trim();
      if (!text) return;
      text.split(/[\/|·｜,]/).forEach(part => {
        const cleaned = part.trim();
        if (cleaned) collected.push(cleaned);
      });
    });
  };

  addValue(question.answer);
  addValue(question.accepted_answers);

  return Array.from(new Set(collected));
}

function buildPrompt(sourceText: string, qtype: string, qcount: string) {
  return `당신은 학습 자료를 바탕으로 퀴즈를 만드는 도우미입니다.
아래 [학습자료]를 읽고 핵심 개념을 확인할 수 있는 문제를 정확히 ${qcount}개 만드세요.
문제 유형: ${qtype} (혼합인 경우 객관식/OX/주관식을 골고루 섞을 것)

각 문제는 다음 JSON 스키마를 따르는 배열로만 응답하세요. 다른 설명, 마크다운, 코드블록 없이 순수 JSON 배열만 출력하세요.

[
  {
    "type": "multiple_choice" | "ox" | "short_answer",
    "question": "문제 내용",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 (... short_answer는 가장 대표적인 정답 텍스트)",
    "accepted_answers": ["short_answer일 때만: 동의어/유사 표현 배열. 예: [\"키워드\", \"예약어\"]"],
    "explanation": "정답 해설 한두 문장"
  }
]

[학습자료]
${sourceText}`;
}

async function callGemini(prompt: string) {
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API 오류 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('응답에서 텍스트를 찾을 수 없습니다.');

  const cleaned = String(text).replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned) as QuizQuestion[];
}

function validateSourceText(sourceText: string) {
  const trimmed = sourceText.trim();
  if (!trimmed) return '학습 자료를 먼저 입력해주세요.';
  if (trimmed.length < 20) return '학습 자료가 너무 짧습니다. 조금 더 자세한 내용을 입력해주세요.';
  return '';
}

function App() {
  const [state, setState] = useState<QuizAppState>({
    sourceText: '',
    questionType: '객관식',
    questionCount: '5',
    questions: [],
    answers: {},
    isGraded: false,
    status: '',
    isLoading: false,
  });

  const totalQuestions = state.questions.length;
  const correctCount = useMemo(() => {
    return state.questions.reduce((count, question, index) => {
      const userAnswer = (state.answers[index] ?? '').toString().trim();
      let isCorrect = false;

      if (question.type === 'short_answer') {
        const userNorm = normalizeAnswerValue(userAnswer);
        const candidates = getShortAnswerCandidates(question);
        isCorrect = candidates.some(candidate => normalizeAnswerValue(candidate) === userNorm);
      } else {
        isCorrect = userAnswer === question.answer;
      }

      return count + (isCorrect ? 1 : 0);
    }, 0);
  }, [state.answers, state.questions]);

  const handleGenerate = async () => {
    const validationMessage = validateSourceText(state.sourceText);
    if (validationMessage) {
      setState(prev => ({
        ...prev,
        status: validationMessage,
        error: 'empty',
        isLoading: false,
      }));
      return;
    }

    if (!API_KEY) {
      setState(prev => ({
        ...prev,
        status: 'Gemini API 키가 설정되지 않았습니다. 로컬 환경 변수 VITE_GEMINI_API_KEY를 추가해주세요.',
        error: 'missing-api-key',
        isLoading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, status: 'AI가 퀴즈를 생성하는 중입니다...', error: undefined }));

    try {
      const prompt = buildPrompt(state.sourceText, state.questionType, state.questionCount);
      const questions = await callGemini(prompt);
      setState(prev => ({
        ...prev,
        questions,
        answers: {},
        isGraded: false,
        status: '',
        isLoading: false,
        error: undefined,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        status: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        error: 'generation-failed',
      }));
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    setState(prev => ({ ...prev, answers: { ...prev.answers, [index]: value } }));
  };

  const handleSubmit = () => {
    if (!state.questions.length) return;
    const unanswered = state.questions.some((_, index) => (state.answers[index] ?? '').toString().trim() === '');
    if (unanswered && !window.confirm('아직 풀지 않은 문제가 있습니다. 그래도 채점할까요?')) return;
    setState(prev => ({ ...prev, isGraded: true }));
  };

  const handleReset = () => {
    setState(prev => ({
      ...prev,
      sourceText: '',
      questions: [],
      answers: {},
      isGraded: false,
      status: '',
      error: undefined,
    }));
  };

  return (
    <div className="wrap">
      <h1>AI 학습 퀴즈 생성기</h1>
      <p className="sub">학습 자료 텍스트를 붙여넣으면 AI가 퀴즈를 자동으로 만들어줘요.</p>

      {!state.questions.length ? (
        <SourceInputPanel
          state={state}
          onSourceTextChange={value => setState(prev => ({ ...prev, sourceText: value }))}
          onQuestionTypeChange={value => setState(prev => ({ ...prev, questionType: value }))}
          onQuestionCountChange={value => setState(prev => ({ ...prev, questionCount: value }))}
          onGenerate={() => void handleGenerate()}
          onRetry={() => void handleGenerate()}
        />
      ) : (
        <div className="panel">
          <div className="questions">
            {state.questions.map((question, index) => {
              const selectedAnswer = (state.answers[index] ?? '').toString();
              return (
                <QuizQuestionCard
                  key={`${question.question}-${index}`}
                  question={question}
                  index={index}
                  selectedAnswer={selectedAnswer}
                  isGraded={state.isGraded}
                  onAnswerChange={handleAnswerChange}
                />
              );
            })}
          </div>

          <div className="row">
            <button onClick={handleSubmit} disabled={state.isGraded}>
              {state.isGraded ? '채점 완료' : '채점하기'}
            </button>
            <button className="secondary" onClick={handleReset}>새 퀴즈 만들기</button>
          </div>

          {state.isGraded && <ResultSummary correctCount={correctCount} totalQuestions={totalQuestions} />}
        </div>
      )}
    </div>
  );
}

export default App;
