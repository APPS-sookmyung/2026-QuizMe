type Props = {
  correctCount: number;
  totalQuestions: number;
};

export function ResultSummary({ correctCount, totalQuestions }: Props) {
  const accuracy = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="result-banner">
      <div className="score">{correctCount} / {totalQuestions}</div>
      <div className="score-sub">정답률 {accuracy}%</div>
    </div>
  );
}
