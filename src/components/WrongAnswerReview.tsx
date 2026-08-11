import type { QuizQuestion } from '../types/quiz';

type WrongItem = {
  question: QuizQuestion;
  userAnswer: string;
};

type Props = {
  items: WrongItem[];
  onRetryWrongOnly: () => void;
};

export function WrongAnswerReview({ items, onRetryWrongOnly }: Props) {
  if (!items.length) return null;

  return (
    <div className="wrong-review">
      <div className="wrong-review-header">
        <span className="wrong-review-title">틀린 문제 모아보기 ({items.length}개)</span>
        <button className="secondary" onClick={onRetryWrongOnly}>틀린 문제만 다시 풀기</button>
      </div>

      <div className="wrong-review-list">
        {items.map((item, index) => (
          <div key={index} className="wrong-review-item">
            <div className="wrong-review-question">{item.question.question}</div>
            <div className="wrong-review-answer">내 답: {item.userAnswer || '(미응답)'}</div>
            <div className="wrong-review-correct">정답: {item.question.answer}</div>
            {item.question.explanation && <div className="explain">해설: {item.question.explanation}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
