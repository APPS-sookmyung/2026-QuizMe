export type QuizQuestion = {
  type: 'multiple_choice' | 'ox' | 'short_answer';
  question: string;
  options?: string[];
  answer: string;
  accepted_answers?: string[];
  explanation?: string;
};

export type Flashcard = {
  term: string;
  definition: string;
};

export type SavedQuizSession = {
  id: string;
  sourceText: string;
  questionType: string;
  questionCount: string;
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
  count: string;
  flashcards: Flashcard[];
  createdAt: string;
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
  flashcards: Flashcard[];
  flashcardIndex: number;
  isFlipped: boolean;
  mode: 'quiz' | 'flashcard';
  savedSessions: SavedQuizSession[];
  selectedSessionId: string | null;
  savedFlashcardSets: SavedFlashcardSet[];
};
