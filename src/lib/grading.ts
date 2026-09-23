import type { QuizQuestion } from '../types/quiz';

export function isQuestionCorrect(question: QuizQuestion, userAnswer: string) {
  const trimmed = userAnswer.trim();
  if (question.type === 'short_answer') {
    const userNorm = normalizeAnswerValue(trimmed);
    return getShortAnswerCandidates(question).some(candidate => normalizeAnswerValue(candidate) === userNorm);
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
