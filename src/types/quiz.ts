export type QuizQuestion = {
  type: 'multiple_choice' | 'ox' | 'short_answer';
  question: string;
  options?: string[];
  answer: string;
  accepted_answers?: string[];
  explanation?: string;
};

export type QuizAppState = {
  sourceText: string;
  questionType: string;
  questionCount: string;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  isGraded: boolean;
  status: string;
  isLoading: boolean;
  error?: string;
};
