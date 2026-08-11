import type { QuizQuestion } from '../types/quiz';

type Props = {
  question: QuizQuestion;
  index: number;
  selectedAnswer: string;
  isGraded: boolean;
  isCorrect: boolean;
  onAnswerChange: (index: number, value: string) => void;
};

function labelForType(type: QuizQuestion['type']) {
  if (type === 'multiple_choice') return '객관식';
  if (type === 'ox') return 'OX';
  return '주관식';
}

export function QuizQuestionCard({ question, index, selectedAnswer, isGraded, isCorrect, onAnswerChange }: Props) {
  const renderOption = (option: string) => {
    const classNames = ['opt'];
    if (!isGraded && selectedAnswer === option) classNames.push('selected');
    if (isGraded) {
      if (option === question.answer) classNames.push('correct');
      else if (option === selectedAnswer) classNames.push('incorrect');
    }

    return (
      <button
        key={option}
        type="button"
        className={classNames.join(' ')}
        disabled={isGraded}
        onClick={() => onAnswerChange(index, option)}
      >
        {option}
      </button>
    );
  };

  const renderInput = () => {
    if (question.type === 'multiple_choice') {
      return <>{question.options?.map(option => renderOption(option))}</>;
    }

    if (question.type === 'ox') {
      return (
        <div className="ox-row">
          {renderOption('O')}
          {renderOption('X')}
        </div>
      );
    }

    return (
      <>
        <input
          type="text"
          value={selectedAnswer}
          disabled={isGraded}
          onChange={e => onAnswerChange(index, e.target.value)}
          placeholder="답을 입력하세요"
          style={isGraded ? { borderColor: isCorrect ? 'var(--good)' : 'var(--bad)' } : undefined}
        />
        {isGraded && !isCorrect && <div className="short-answer-hint">정답: {question.answer}</div>}
      </>
    );
  };

  return (
    <div className="card">
      <span className="question-badge">문제 {index + 1} · {labelForType(question.type)}</span>
      <div className="question-text">{question.question}</div>
      {renderInput()}
      {isGraded && question.explanation && <div className="explain">해설: {question.explanation}</div>}
    </div>
  );
}
