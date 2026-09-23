import { useRef } from 'react';
import type { QuizAppState } from '../types/quiz';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUESTION_COUNTS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type GenerationOptions,
  type QuestionType,
} from '../shared/generation';

type Props = {
  state: QuizAppState;
  onSourceTextChange: (value: string) => void;
  onOptionsChange: (options: GenerationOptions) => void;
  onGenerate: () => void;
  onRetry: () => void;
  onGenerateFlashcards: () => void;
  onPdfUpload: (file: File) => void;
  canGenerate: boolean;
  onSignIn: () => void;
};

export function SourceInputPanel({ state, onSourceTextChange, onOptionsChange, onGenerate, onRetry, onGenerateFlashcards, onPdfUpload, canGenerate, onSignIn }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { options } = state;

  const toggleType = (type: QuestionType) => {
    const selected = options.questionTypes.includes(type);
    if (selected && options.questionTypes.length === 1) return;
    const next = selected
      ? options.questionTypes.filter(t => t !== type)
      : QUESTION_TYPES.filter(t => t === type || options.questionTypes.includes(t));
    onOptionsChange({ ...options, questionTypes: next });
  };

  return (
    <div className="panel">
      {!canGenerate && (
        <div className="banner">
          <span>로그인하면 퀴즈와 플래시카드를 만들고 기록을 계정에 저장할 수 있어요.</span>
          <button className="auth-btn" onClick={onSignIn}>Google로 로그인</button>
        </div>
      )}
      <div className="input-card">
        <label htmlFor="sourceText" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>학습 자료</label>
        <textarea id="sourceText" value={state.sourceText} onChange={e => onSourceTextChange(e.target.value)} placeholder="여기에 학습 자료(필기, 요약, 강의 노트 등)를 붙여넣으세요..." />
      </div>

      <div className="row">
        <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={state.isLoading}>
          PDF 업로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onPdfUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      <fieldset className="type-group">
        <legend>문제 유형 <span className="hint">(여러 개 선택 가능 · 플래시카드에는 적용 안 됨)</span></legend>
        {QUESTION_TYPES.map(type => (
          <label key={type} className={`type-chip ${options.questionTypes.includes(type) ? 'checked' : ''}`}>
            <input type="checkbox" checked={options.questionTypes.includes(type)} onChange={() => toggleType(type)} />
            {QUESTION_TYPE_LABELS[type]}
          </label>
        ))}
      </fieldset>

      <div className="row">
        <label style={{ flex: 1 }}>
          난이도
          <select value={options.difficulty} onChange={e => onOptionsChange({ ...options, difficulty: e.target.value as Difficulty })}>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
          </select>
        </label>

        <label style={{ flex: 1 }}>
          문제 수
          <select value={options.questionCount} onChange={e => onOptionsChange({ ...options, questionCount: Number(e.target.value) })}>
            {QUESTION_COUNTS.map(n => <option key={n} value={n}>{n}개</option>)}
          </select>
        </label>
      </div>

      <div className="row">
        <button onClick={onGenerate} disabled={state.isLoading}>
          {state.isLoading ? '생성 중...' : '퀴즈 생성'}
        </button>
        <button className="secondary" onClick={onGenerateFlashcards} disabled={state.isLoading}>
          {state.isLoading ? '생성 중...' : '플래시카드로 만들기'}
        </button>
        {state.error && <button className="secondary" onClick={onRetry}>다시 시도</button>}
      </div>

      {state.status && <p className={`status ${state.error ? 'error' : ''}`}>{state.status}</p>}
    </div>
  );
}
