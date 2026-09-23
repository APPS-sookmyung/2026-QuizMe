export const QUESTION_TYPES = ['multiple_choice', 'ox', 'short_answer'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const MAX_QUESTION_COUNT = 20;

export const MIN_SOURCE_CHARS = 20;
export const MAX_SOURCE_CHARS_PER_REQUEST = 12000;

export type GenerationKind = 'quiz' | 'flashcard';

export type GenerationOptions = {
  difficulty: Difficulty;
  questionTypes: QuestionType[];
  questionCount: number;
};

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  difficulty: 'medium',
  questionTypes: ['multiple_choice'],
  questionCount: 5,
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: '객관식',
  ox: 'OX',
  short_answer: '주관식',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};
