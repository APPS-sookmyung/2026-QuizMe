import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import { QuizQuestionCard } from './components/QuizQuestionCard';
import { ResultSummary } from './components/ResultSummary';
import { SourceInputPanel } from './components/SourceInputPanel';
import { FlashcardDeck } from './components/FlashcardDeck';
import { WrongAnswerReview } from './components/WrongAnswerReview';
import { StatsDashboard } from './components/StatsDashboard';
import { AuthControls } from './components/AuthControls';
import type { Attempt, Flashcard, QuizAppState, QuizQuestion, SavedFlashcardSet, SavedQuizSession } from './types/quiz';
import {
  DEFAULT_GENERATION_OPTIONS,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type GenerationKind,
  type GenerationOptions,
} from './shared/generation';
import { isQuestionCorrect } from './lib/grading';
import { extractPdf, generateChunked, MAX_PDF_SIZE_BYTES, validateSourceText } from './lib/api';
import { createSupabaseRepository, localRepository, migrateLocalToRemote, type Repository } from './lib/repository';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';

type View = 'home' | 'saved' | 'stats';

function describeOptions(options: GenerationOptions, kind: GenerationKind) {
  const types = kind === 'quiz' ? `${options.questionTypes.map(t => QUESTION_TYPE_LABELS[t]).join('·')} · ` : '';
  return `${types}${DIFFICULTY_LABELS[options.difficulty]}`;
}

function errorMessage(error: unknown) {
  return `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
}

const LOGIN_REQUIRED_MESSAGE = '로그인하면 퀴즈와 플래시카드를 만들 수 있어요.';

function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('home');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [state, setState] = useState<QuizAppState>({
    sourceText: '',
    options: DEFAULT_GENERATION_OPTIONS,
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

  const userId = auth.user?.id ?? null;
  const repo: Repository = useMemo(
    () => (userId && supabase ? createSupabaseRepository(supabase) : localRepository),
    [userId],
  );
  const canGenerate = !auth.enabled || userId !== null;
  const showMigration = userId !== null && !migrationDismissed && localRepository.hasData();

  const reloadSaved = async (target: Repository) => {
    setAttemptsLoading(true);
    try {
      const [savedSessions, savedFlashcardSets, loadedAttempts] = await Promise.all([
        target.listSessions(),
        target.listFlashcardSets(),
        target.listAttempts(),
      ]);
      // Ids from the previous repository are meaningless in the new one.
      setState(prev => ({ ...prev, savedSessions, savedFlashcardSets, selectedSessionId: null }));
      setAttempts(loadedAttempts);
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'load-failed' }));
    } finally {
      setAttemptsLoading(false);
    }
  };

  useEffect(() => {
    if (auth.ready) void reloadSaved(repo);
  }, [repo, auth.ready]);

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

  const guardGeneration = () => {
    if (!canGenerate) {
      setState(prev => ({ ...prev, status: LOGIN_REQUIRED_MESSAGE, error: 'login-required' }));
      return false;
    }
    const validationMessage = validateSourceText(state.sourceText);
    if (validationMessage) {
      setState(prev => ({ ...prev, status: validationMessage, error: 'empty', isLoading: false }));
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!guardGeneration()) return;
    setState(prev => ({ ...prev, isLoading: true, status: 'AI가 퀴즈를 생성하는 중입니다...', error: undefined }));

    try {
      const questions = await generateChunked<QuizQuestion>('quiz', state.sourceText, state.options);
      setState(prev => ({
        ...prev,
        questions,
        answers: {},
        isGraded: false,
        status: '',
        isLoading: false,
        error: undefined,
        selectedSessionId: null,
        mode: 'quiz',
      }));
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false, status: errorMessage(error), error: 'generation-failed' }));
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!guardGeneration()) return;
    setState(prev => ({ ...prev, isLoading: true, status: '플래시카드를 생성하는 중입니다...', error: undefined }));

    try {
      const flashcards = await generateChunked<Flashcard>('flashcard', state.sourceText, state.options);
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
      setState(prev => ({ ...prev, isLoading: false, status: errorMessage(error), error: 'generation-failed' }));
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!canGenerate) {
      setState(prev => ({ ...prev, status: LOGIN_REQUIRED_MESSAGE, error: 'login-required' }));
      return;
    }
    if (file.type !== 'application/pdf') {
      setState(prev => ({ ...prev, status: 'PDF 파일만 업로드할 수 있습니다.', error: 'invalid-file' }));
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      setState(prev => ({ ...prev, status: 'PDF 용량이 너무 큽니다 (3MB 이하만 지원).', error: 'invalid-file' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, status: 'PDF에서 텍스트를 추출하는 중입니다...', error: undefined }));

    try {
      const data = await extractPdf(file);
      setState(prev => ({
        ...prev,
        sourceText: data.text,
        isLoading: false,
        status: `PDF에서 텍스트를 불러왔습니다. (${data.source === 'ocr' ? 'OCR 인식' : '텍스트 추출'})`,
        error: undefined,
      }));
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false, status: errorMessage(error), error: 'pdf-extraction-failed' }));
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    setState(prev => ({ ...prev, answers: { ...prev.answers, [index]: value } }));
  };

  const handleSubmit = async () => {
    if (!state.questions.length) return;
    const unanswered = state.questions.some((_, index) => (state.answers[index] ?? '').toString().trim() === '');
    if (unanswered && !window.confirm('아직 풀지 않은 문제가 있습니다. 그래도 채점할까요?')) return;
    setState(prev => ({ ...prev, isGraded: true }));

    try {
      const attempt = await repo.recordAttempt({
        setId: state.selectedSessionId,
        options: state.options,
        items: state.questions.map((question, index) => {
          const userAnswer = (state.answers[index] ?? '').toString();
          return {
            question: question.question,
            type: question.type,
            concept: question.concept ?? '',
            userAnswer,
            correctAnswer: question.answer,
            isCorrect: isQuestionCorrect(question, userAnswer),
          };
        }),
      });
      setAttempts(prev => [attempt, ...prev]);
    } catch (error) {
      setState(prev => ({ ...prev, status: `채점 기록을 저장하지 못했어요. ${errorMessage(error)}`, error: 'record-failed' }));
    }
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

  const saveCurrentSession = async () => {
    try {
      const session = await repo.saveSession({
        sourceText: state.sourceText,
        options: state.options,
        questions: state.questions,
        answers: state.answers,
        isGraded: state.isGraded,
        correctCount,
        totalQuestions,
      });
      setState(prev => ({
        ...prev,
        savedSessions: [session, ...prev.savedSessions],
        selectedSessionId: session.id,
        status: '퀴즈가 저장되었습니다.',
        error: undefined,
      }));
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'save-failed' }));
    }
  };

  const openSession = (session: SavedQuizSession, mode: 'resume' | 'result' | 'fresh') => {
    setState(prev => ({
      ...prev,
      sourceText: session.sourceText,
      options: session.options,
      questions: session.questions,
      answers: mode === 'fresh' ? {} : session.answers,
      isGraded: mode === 'result' ? true : mode === 'fresh' ? false : session.isGraded,
      status: '',
      error: undefined,
      selectedSessionId: session.id,
      mode: 'quiz',
    }));
    setView('home');
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

  const deleteSavedSession = async (id: string) => {
    try {
      await repo.deleteSession(id);
      setState(prev => ({
        ...prev,
        savedSessions: prev.savedSessions.filter(session => session.id !== id),
        selectedSessionId: prev.selectedSessionId === id ? null : prev.selectedSessionId,
      }));
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'delete-failed' }));
    }
  };

  const saveCurrentFlashcards = async () => {
    if (!state.flashcards.length) return;
    try {
      const set = await repo.saveFlashcardSet({
        sourceText: state.sourceText,
        options: state.options,
        flashcards: state.flashcards,
      });
      setState(prev => ({
        ...prev,
        savedFlashcardSets: [set, ...prev.savedFlashcardSets],
        status: '플래시카드가 저장되었습니다.',
        error: undefined,
      }));
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'save-failed' }));
    }
  };

  const loadFlashcardSet = (set: SavedFlashcardSet) => {
    setState(prev => ({
      ...prev,
      sourceText: set.sourceText,
      options: set.options,
      flashcards: set.flashcards,
      flashcardIndex: 0,
      isFlipped: false,
      status: '',
      error: undefined,
      mode: 'flashcard',
    }));
    setView('home');
  };

  const deleteSavedFlashcardSet = async (id: string) => {
    try {
      await repo.deleteFlashcardSet(id);
      setState(prev => ({ ...prev, savedFlashcardSets: prev.savedFlashcardSets.filter(set => set.id !== id) }));
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'delete-failed' }));
    }
  };

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      await migrateLocalToRemote(repo);
      setMigrationDismissed(true);
      await reloadSaved(repo);
      setState(prev => ({ ...prev, status: '이 기기의 기록을 계정으로 옮겼어요.', error: undefined }));
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'migrate-failed' }));
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await auth.signIn();
    } catch (error) {
      setState(prev => ({ ...prev, status: errorMessage(error), error: 'login-failed' }));
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    handleReset();
    setMigrationDismissed(false);
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
        <div className="topbar-right">
          <nav className="topnav">
            <button className={`nav-btn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>홈</button>
            <button className={`nav-btn ${view === 'saved' ? 'active' : ''}`} onClick={() => setView('saved')}>저장된 퀴즈</button>
            <button className={`nav-btn ${view === 'stats' ? 'active' : ''}`} onClick={() => setView('stats')}>학습 분석</button>
          </nav>
          <AuthControls
            enabled={auth.enabled}
            ready={auth.ready}
            user={auth.user}
            onSignIn={() => void handleSignIn()}
            onSignOut={() => void handleSignOut()}
          />
        </div>
      </header>

      <div className="wrap">
        {showMigration && (
          <div className="banner" role="status">
            <span>로그인 전에 이 기기에 저장한 퀴즈·풀이 기록이 있어요. 계정으로 옮길까요?</span>
            <div className="row">
              <button onClick={() => void handleMigrate()} disabled={isMigrating}>
                {isMigrating ? '옮기는 중...' : '계정으로 옮기기'}
              </button>
              <button className="secondary" onClick={() => setMigrationDismissed(true)} disabled={isMigrating}>나중에</button>
            </div>
          </div>
        )}

        {view === 'stats' ? (
          <StatsDashboard attempts={attempts} isLoading={attemptsLoading} />
        ) : view === 'saved' ? (
          <div className="panel">
            <h2 className="panel-title">저장된 퀴즈 / 결과</h2>
            <p className="sub">이전 세션을 다시 풀거나, 결과만 다시 확인할 수 있어요.</p>
            {state.savedSessions.length > 0 ? (
              <div className="saved-session-list">
                {state.savedSessions.map(session => (
                  <div key={session.id} className="saved-session-item">
                    <div className="saved-session-title">{describeOptions(session.options, 'quiz')} · {session.totalQuestions}문제</div>
                    <div className="saved-session-meta">{new Date(session.createdAt).toLocaleString()}</div>
                    <div className="saved-session-result">
                      {session.isGraded ? `결과: ${session.correctCount}/${session.totalQuestions}` : '아직 미채점'}
                    </div>
                    <div className="row saved-session-actions">
                      <button className="secondary" onClick={() => openSession(session, 'resume')}>다시 풀기</button>
                      <button className="secondary" onClick={() => openSession(session, 'result')}>결과만 보기</button>
                      <button className="secondary" onClick={() => openSession(session, 'fresh')}>새로 풀기</button>
                      <button className="danger" onClick={() => void deleteSavedSession(session.id)}>삭제</button>
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
                      <div className="saved-session-title">플래시카드 · {describeOptions(set.options, 'flashcard')} · {set.flashcards.length}장</div>
                      <div className="saved-session-meta">{new Date(set.createdAt).toLocaleString()}</div>
                      <div className="row saved-session-actions">
                        <button className="secondary" onClick={() => loadFlashcardSet(set)}>다시 보기</button>
                        <button className="danger" onClick={() => void deleteSavedFlashcardSet(set.id)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sub">아직 저장된 플래시카드가 없습니다.</div>
              )}
            </div>
            {state.status && <p className={`status ${state.error ? 'error' : ''}`}>{state.status}</p>}
          </div>
        ) : (
          <>
            <h1>QuizMe!</h1>
            <p className="sub">학습 자료 텍스트를 붙여넣으면 AI가 퀴즈를 자동으로 만들어줘요.</p>

            {!state.questions.length && state.mode === 'quiz' && !state.flashcards.length ? (
              <SourceInputPanel
                state={state}
                canGenerate={canGenerate}
                onSourceTextChange={value => setState(prev => ({ ...prev, sourceText: value }))}
                onOptionsChange={options => setState(prev => ({ ...prev, options }))}
                onGenerate={() => void handleGenerate()}
                onRetry={() => void handleGenerate()}
                onGenerateFlashcards={() => void handleGenerateFlashcards()}
                onPdfUpload={file => void handlePdfUpload(file)}
                onSignIn={() => void handleSignIn()}
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
                  <button className="secondary" onClick={() => void saveCurrentFlashcards()}>저장하기</button>
                  <button className="secondary" onClick={handleReset}>새로 시작</button>
                </div>

                {state.status && <p className={`status ${state.error ? 'error' : ''}`}>{state.status}</p>}
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
                  <button onClick={() => void handleSubmit()} disabled={state.isGraded}>
                    {state.isGraded ? '채점 완료' : '채점하기'}
                  </button>
                  <button className="secondary" onClick={() => void saveCurrentSession()}>저장하기</button>
                  <button className="secondary" onClick={handleReset}>새 퀴즈 만들기</button>
                </div>

                {state.status && <p className={`status ${state.error ? 'error' : ''}`}>{state.status}</p>}

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
