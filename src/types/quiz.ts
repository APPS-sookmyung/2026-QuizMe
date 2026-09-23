import type { GenerationOptions, QuestionType } from '../shared/generation';

export type QuizQuestion = {
  type: QuestionType;
  question: string;
  options?: string[];
  answer: string;
  accepted_answers?: string[];
  explanation?: string;
  concept?: string;
};

export type Flashcard = {
  term: string;
  definition: string;
};

export type SavedQuizSession = {
  id: string;
  sourceText: string;
  options: GenerationOptions;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  isGraded: boolean;
  createdAt: string;
  correctCount: number;
  totalQuestions: number;
};

export type SavedFlashcardSet = {
  id: string;
  sourceText: string;
  options: GenerationOptions;
  flashcards: Flashcard[];
  createdAt: string;
};

export type AttemptItem = {
  question: string;
  type: QuestionType;
  concept: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};

export type Attempt = {
  id: string;
  setId: string | null;
  options: GenerationOptions;
  createdAt: string;
  items: AttemptItem[];
};

export type QuizAppState = {
  sourceText: string;
  options: GenerationOptions;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  isGraded: boolean;
  status: string;
  isLoading: boolean;
  error?: string;
  flashcards: Flashcard[];
  flashcardIndex: number;
  isFlipped: boolean;
  mode: 'quiz' | 'flashcard';
  savedSessions: SavedQuizSession[];
  selectedSessionId: string | null;
  savedFlashcardSets: SavedFlashcardSet[];
};
