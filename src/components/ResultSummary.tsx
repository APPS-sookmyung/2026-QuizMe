type Props = {
  correctCount: number;
  totalQuestions: number;
};

export function ResultSummary({ correctCount, totalQuestions }: Props) {
  const accuracy = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="result">
      <div>정답 수: {correctCount}/{totalQuestions}</div>
      <div>정답률: {accuracy}%</div>
    </div>
  );
}
