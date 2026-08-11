import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import { QuizQuestionCard } from './components/QuizQuestionCard';
import { ResultSummary } from './components/ResultSummary';
import { SourceInputPanel } from './components/SourceInputPanel';
import { FlashcardDeck } from './components/FlashcardDeck';
import { WrongAnswerReview } from './components/WrongAnswerReview';
import type { Flashcard, QuizAppState, QuizQuestion, SavedFlashcardSet, SavedQuizSession } from './types/quiz';

const SESSIONS_STORAGE_KEY = 'quizme-saved-sessions';
const FLASHCARDS_STORAGE_KEY = 'quizme-saved-flashcards';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function isQuestionCorrect(question: QuizQuestion, userAnswer: string) {
  const trimmed = userAnswer.trim();
  if (question.type === 'short_answer') {
    const userNorm = normalizeAnswerValue(trimmed);
    const candidates = getShortAnswerCandidates(question);
    return candidates.some(candidate => normalizeAnswerValue(candidate) === userNorm);
  }
  return trimmed === question.answer;
}

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

const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1500, 3000];

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGemini(prompt: string) {
  let res: Response;
  let attempt = 0;

  while (true) {
    res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });

    if (res.ok) break;
    if (!RETRYABLE_STATUS_CODES.has(res.status) || attempt >= RETRY_DELAYS_MS.length) {
      const errText = await res.text();
      throw new Error(`API 오류 (${res.status}): ${errText.slice(0, 200)}`);
    }

    await delay(RETRY_DELAYS_MS[attempt]);
    attempt += 1;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('응답에서 텍스트를 찾을 수 없습니다.');

  const cleaned = String(text).replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

function buildFlashcardPrompt(sourceText: string, count: string) {
  return `당신은 학습 자료를 바탕으로 플래시카드를 만드는 도우미입니다.
아래 [학습자료]를 읽고 핵심 개념과 그 정의를 짧고 명확하게 묶어서 ${count}개의 플래시카드를 만드세요.
각 카드는 다음 JSON 스키마를 따르는 객체 배열로만 응답하세요. 다른 설명 없이 순수 JSON 배열만 출력하세요.

[
  { "term": "개념", "definition": "정의" }
]

[학습자료]
${sourceText}`;
}

function validateSourceText(sourceText: string) {
  const trimmed = sourceText.trim();
  if (!trimmed) return '학습 자료를 먼저 입력해주세요.';
  if (trimmed.length < 20) return '학습 자료가 너무 짧습니다. 조금 더 자세한 내용을 입력해주세요.';
  return '';
}

function App() {
  const [view, setView] = useState<'home' | 'saved'>('home');
  const [state, setState] = useState<QuizAppState>({
    sourceText: '',
    questionType: '객관식',
    questionCount: '5',
    questions: [],
    answers: {},
    isGraded: false,
    status: '',
    isLoading: false,
    flashcards: [],
    flashcardIndex: 0,
    isFlipped: false,
    mode: 'quiz',
    savedSessions: [],
    selectedSessionId: null,
    savedFlashcardSets: [],
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedQuizSession[];
        setState(prev => ({ ...prev, savedSessions: parsed }));
      }
    } catch {
      // ignore
    }

    try {
      const raw = localStorage.getItem(FLASHCARDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedFlashcardSet[];
        setState(prev => ({ ...prev, savedFlashcardSets: parsed }));
      }
    } catch {
      // ignore
    }
  }, []);

  const totalQuestions = state.questions.length;
  const correctCount = useMemo(() => {
    return state.questions.reduce((count, question, index) => {
      const userAnswer = (state.answers[index] ?? '').toString();
      return count + (isQuestionCorrect(question, userAnswer) ? 1 : 0);
    }, 0);
  }, [state.answers, state.questions]);

  const wrongItems = useMemo(() => {
    if (!state.isGraded) return [];
    return state.questions
      .map((question, index) => ({ question, userAnswer: (state.answers[index] ?? '').toString() }))
      .filter(item => !isQuestionCorrect(item.question, item.userAnswer));
  }, [state.isGraded, state.questions, state.answers]);

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
      const questions = await callGemini(prompt) as QuizQuestion[];
      setState(prev => ({
        ...prev,
        questions,
        answers: {},
        isGraded: false,
        status: '',
        isLoading: false,
        error: undefined,
        mode: 'quiz',
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

  const handleGenerateFlashcards = async () => {
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

    setState(prev => ({ ...prev, isLoading: true, status: '플래시카드를 생성하는 중입니다...', error: undefined }));

    try {
      const prompt = buildFlashcardPrompt(state.sourceText, state.questionCount);
      const raw = await callGemini(prompt) as Flashcard[];
      const flashcards = Array.isArray(raw) ? raw : [];
      setState(prev => ({
        ...prev,
        flashcards,
        flashcardIndex: 0,
        isFlipped: false,
        status: '',
        isLoading: false,
        error: undefined,
        mode: 'flashcard',
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
      flashcards: [],
      flashcardIndex: 0,
      isFlipped: false,
      mode: 'quiz',
      selectedSessionId: null,
    }));
  };

  const saveCurrentSession = () => {
    const session: SavedQuizSession = {
      id: `${Date.now()}`,
      sourceText: state.sourceText,
      questionType: state.questionType,
      questionCount: state.questionCount,
      questions: state.questions,
      answers: state.answers,
      isGraded: state.isGraded,
      createdAt: new Date().toISOString(),
      correctCount,
      totalQuestions,
    };

    const nextSessions = [session, ...state.savedSessions].slice(0, 10);
    localStorage.setItem('quizme-saved-sessions', JSON.stringify(nextSessions));
    setState(prev => ({ ...prev, savedSessions: nextSessions, selectedSessionId: session.id, status: '퀴즈가 저장되었습니다.', error: undefined }));
  };

  const loadSession = (session: SavedQuizSession) => {
    setState(prev => ({
      ...prev,
      sourceText: session.sourceText,
      questionType: session.questionType,
      questionCount: session.questionCount,
      questions: session.questions,
      answers: session.answers,
      isGraded: session.isGraded,
      status: '',
      error: undefined,
      selectedSessionId: session.id,
      mode: 'quiz',
    }));
  };

  const replaySession = (session: SavedQuizSession) => {
    setState(prev => ({
      ...prev,
      sourceText: session.sourceText,
      questionType: session.questionType,
      questionCount: session.questionCount,
      questions: session.questions,
      answers: {},
      isGraded: false,
      status: '',
      error: undefined,
      selectedSessionId: session.id,
      mode: 'quiz',
    }));
  };

  const viewOnlyResult = (session: SavedQuizSession) => {
    setState(prev => ({
      ...prev,
      sourceText: session.sourceText,
      questionType: session.questionType,
      questionCount: session.questionCount,
      questions: session.questions,
      answers: session.answers,
      isGraded: true,
      status: '',
      error: undefined,
      selectedSessionId: session.id,
      mode: 'quiz',
    }));
  };

  const retryWrongOnly = () => {
    if (!wrongItems.length) return;
    setState(prev => ({
      ...prev,
      questions: wrongItems.map(item => item.question),
      answers: {},
      isGraded: false,
      status: '',
      error: undefined,
      selectedSessionId: null,
      mode: 'quiz',
    }));
  };

  const deleteSavedSession = (id: string) => {
    const nextSessions = state.savedSessions.filter(session => session.id !== id);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(nextSessions));
    setState(prev => ({
      ...prev,
      savedSessions: nextSessions,
      selectedSessionId: prev.selectedSessionId === id ? null : prev.selectedSessionId,
    }));
  };

  const saveCurrentFlashcards = () => {
    if (!state.flashcards.length) return;
    const set: SavedFlashcardSet = {
      id: `${Date.now()}`,
      sourceText: state.sourceText,
      count: state.questionCount,
      flashcards: state.flashcards,
      createdAt: new Date().toISOString(),
    };

    const nextSets = [set, ...state.savedFlashcardSets].slice(0, 10);
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(nextSets));
    setState(prev => ({ ...prev, savedFlashcardSets: nextSets, status: '플래시카드가 저장되었습니다.', error: undefined }));
  };

  const loadFlashcardSet = (set: SavedFlashcardSet) => {
    setState(prev => ({
      ...prev,
      sourceText: set.sourceText,
      questionCount: set.count,
      flashcards: set.flashcards,
      flashcardIndex: 0,
      isFlipped: false,
      status: '',
      error: undefined,
      mode: 'flashcard',
    }));
  };

  const deleteSavedFlashcardSet = (id: string) => {
    const nextSets = state.savedFlashcardSets.filter(set => set.id !== id);
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(nextSets));
    setState(prev => ({ ...prev, savedFlashcardSets: nextSets }));
  };

  const handleFlipCard = () => {
    setState(prev => ({ ...prev, isFlipped: !prev.isFlipped }));
  };

  const handleNextCard = () => {
    setState(prev => ({
      ...prev,
      flashcardIndex: (prev.flashcardIndex + 1) % Math.max(prev.flashcards.length, 1),
      isFlipped: false,
    }));
  };

  return (
    <div>
      <header className="topbar">
        <button className="brand-btn" onClick={() => { setView('home'); handleReset(); }}>QuizMe!</button>
        <nav className="topnav">
          <button className={`nav-btn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>홈</button>
          <button className={`nav-btn ${view === 'saved' ? 'active' : ''}`} onClick={() => setView('saved')}>저장된 퀴즈 / 결과</button>
        </nav>
      </header>

      <div className="wrap">
        {view === 'saved' ? (
          <div className="panel">
            <h2 className="panel-title">저장된 퀴즈 / 결과</h2>
            <p className="sub">이전 세션을 다시 풀거나, 결과만 다시 확인할 수 있어요.</p>
            {state.savedSessions.length > 0 ? (
              <div className="saved-session-list">
                {state.savedSessions.map(session => (
                  <div key={session.id} className="saved-session-item">
                    <div className="saved-session-title">{session.questionType} · {session.questionCount}문제</div>
                    <div className="saved-session-meta">{new Date(session.createdAt).toLocaleString()}</div>
                    <div className="saved-session-result">
                      {session.isGraded ? `결과: ${session.correctCount}/${session.totalQuestions}` : '아직 미채점'}
                    </div>
                    <div className="row saved-session-actions">
                      <button className="secondary" onClick={() => { loadSession(session); setView('home'); }}>다시 풀기</button>
                      <button className="secondary" onClick={() => { viewOnlyResult(session); setView('home'); }}>결과만 보기</button>
                      <button className="secondary" onClick={() => { replaySession(session); setView('home'); }}>새로 풀기</button>
                      <button className="danger" onClick={() => deleteSavedSession(session.id)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sub">아직 저장된 퀴즈가 없습니다.</div>
            )}

            <div className="panel-section">
              <h2 className="panel-title">저장된 플래시카드</h2>
              {state.savedFlashcardSets.length > 0 ? (
                <div className="saved-session-list">
                  {state.savedFlashcardSets.map(set => (
                    <div key={set.id} className="saved-session-item">
                      <div className="saved-session-title">플래시카드 · {set.flashcards.length}장</div>
                      <div className="saved-session-meta">{new Date(set.createdAt).toLocaleString()}</div>
                      <div className="row saved-session-actions">
                        <button className="secondary" onClick={() => { loadFlashcardSet(set); setView('home'); }}>다시 보기</button>
                        <button className="danger" onClick={() => deleteSavedFlashcardSet(set.id)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sub">아직 저장된 플래시카드가 없습니다.</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <h1>QuizMe!</h1>
            <p className="sub">학습 자료 텍스트를 붙여넣으면 AI가 퀴즈를 자동으로 만들어줘요.</p>

            {!state.questions.length && state.mode === 'quiz' && !state.flashcards.length ? (
        <SourceInputPanel
          state={state}
          onSourceTextChange={value => setState(prev => ({ ...prev, sourceText: value }))}
          onQuestionTypeChange={value => setState(prev => ({ ...prev, questionType: value }))}
          onQuestionCountChange={value => setState(prev => ({ ...prev, questionCount: value }))}
          onGenerate={() => void handleGenerate()}
          onRetry={() => void handleGenerate()}
          onGenerateFlashcards={() => void handleGenerateFlashcards()}
        />
      ) : state.mode === 'flashcard' && state.flashcards.length ? (
        <div className="panel">
          <FlashcardDeck
            flashcards={state.flashcards}
            currentIndex={state.flashcardIndex}
            isFlipped={state.isFlipped}
            onFlip={handleFlipCard}
            onNext={handleNextCard}
          />

          <div className="row">
            <button className="secondary" onClick={saveCurrentFlashcards}>저장하기</button>
            <button className="secondary" onClick={handleReset}>새로 시작</button>
          </div>

          {state.status && <p className="status">{state.status}</p>}
        </div>
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
                  isCorrect={isQuestionCorrect(question, selectedAnswer)}
                  onAnswerChange={handleAnswerChange}
                />
              );
            })}
          </div>

          <div className="row">
            <button onClick={handleSubmit} disabled={state.isGraded}>
              {state.isGraded ? '채점 완료' : '채점하기'}
            </button>
            <button className="secondary" onClick={saveCurrentSession}>저장하기</button>
            <button className="secondary" onClick={handleReset}>새 퀴즈 만들기</button>
          </div>

          {state.status && <p className="status">{state.status}</p>}

          {state.isGraded && <ResultSummary correctCount={correctCount} totalQuestions={totalQuestions} />}
          {state.isGraded && <WrongAnswerReview items={wrongItems} onRetryWrongOnly={retryWrongOnly} />}
        </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
