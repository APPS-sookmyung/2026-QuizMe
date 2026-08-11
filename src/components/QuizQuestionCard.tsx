import type { QuizQuestion } from '../types/quiz';

type Props = {
  question: QuizQuestion;
  index: number;
  selectedAnswer: string;
  isGraded: boolean;
  onAnswerChange: (index: number, value: string) => void;
};

export function QuizQuestionCard({ question, index, selectedAnswer, isGraded, onAnswerChange }: Props) {
  const renderInput = () => {
    if (question.type === 'multiple_choice') {
      return (
        <div className="options">
          {question.options?.map(option => (
            <label key={option} className="option-label">
              <input type="radio" name={`q-${index}`} checked={selectedAnswer === option} onChange={() => onAnswerChange(index, option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    if (question.type === 'ox') {
      return (
        <div className="options">
          <label className="option-label">
            <input type="radio" name={`q-${index}`} checked={selectedAnswer === 'O'} onChange={() => onAnswerChange(index, 'O')} />
            <span>O</span>
          </label>
          <label className="option-label">
            <input type="radio" name={`q-${index}`} checked={selectedAnswer === 'X'} onChange={() => onAnswerChange(index, 'X')} />
            <span>X</span>
          </label>
        </div>
      );
    }

    return <input type="text" value={selectedAnswer} onChange={e => onAnswerChange(index, e.target.value)} placeholder="정답을 입력하세요" />;
  };

  return (
    <div className="card">
      <strong>{index + 1}. {question.question}</strong>
      {renderInput()}
      {isGraded && (
        <div className="result">
          <div>정답: {question.answer}</div>
          {question.explanation && <div>{question.explanation}</div>}
        </div>
      )}
    </div>
  );
}
