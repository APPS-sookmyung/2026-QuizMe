import type { QuizAppState } from '../types/quiz';

type Props = {
  state: QuizAppState;
  onSourceTextChange: (value: string) => void;
  onQuestionTypeChange: (value: string) => void;
  onQuestionCountChange: (value: string) => void;
  onGenerate: () => void;
  onRetry: () => void;
  onGenerateFlashcards: () => void;
};

export function SourceInputPanel({ state, onSourceTextChange, onQuestionTypeChange, onQuestionCountChange, onGenerate, onRetry, onGenerateFlashcards }: Props) {
  return (
    <div className="panel">
      <div className="input-card">
        <label htmlFor="sourceText" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>학습 자료</label>
        <textarea id="sourceText" value={state.sourceText} onChange={e => onSourceTextChange(e.target.value)} placeholder="여기에 학습 자료(필기, 요약, 강의 노트 등)를 붙여넣으세요..." />
      </div>

      <div className="row">
        <label style={{ flex: 1 }}>
          문제 유형
          <select value={state.questionType} onChange={e => onQuestionTypeChange(e.target.value)}>
            <option value="객관식">객관식</option>
            <option value="OX">OX</option>
            <option value="주관식">주관식</option>
            <option value="혼합">혼합</option>
          </select>
        </label>

        <label style={{ width: 140 }}>
          문제 수
          <select value={state.questionCount} onChange={e => onQuestionCountChange(e.target.value)}>
            <option value="3">3개</option>
            <option value="5">5개</option>
            <option value="7">7개</option>
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
