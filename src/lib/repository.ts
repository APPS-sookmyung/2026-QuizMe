import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_GENERATION_OPTIONS } from '../shared/generation';
import type { Attempt, SavedFlashcardSet, SavedQuizSession } from '../types/quiz';

export type NewSession = Omit<SavedQuizSession, 'id' | 'createdAt'> & { createdAt?: string };
export type NewFlashcardSet = Omit<SavedFlashcardSet, 'id' | 'createdAt'> & { createdAt?: string };
export type NewAttempt = Omit<Attempt, 'id' | 'createdAt'> & { createdAt?: string };

export interface Repository {
  listSessions(): Promise<SavedQuizSession[]>;
  saveSession(session: NewSession): Promise<SavedQuizSession>;
  deleteSession(id: string): Promise<void>;
  listFlashcardSets(): Promise<SavedFlashcardSet[]>;
  saveFlashcardSet(set: NewFlashcardSet): Promise<SavedFlashcardSet>;
  deleteFlashcardSet(id: string): Promise<void>;
  listAttempts(): Promise<Attempt[]>;
  recordAttempt(attempt: NewAttempt): Promise<Attempt>;
}

// ---------- guest mode: localStorage ----------

const KEYS = {
  sessions: 'quizme-saved-sessions',
  flashcards: 'quizme-saved-flashcards',
  attempts: 'quizme-attempts',
};
const LOCAL_LIMITS = { sessions: 10, flashcards: 10, attempts: 300 };

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

function newId() {
  return crypto.randomUUID();
}

export const localRepository: Repository & { hasData(): boolean; clear(): void } = {
  async listSessions() {
    // Sessions saved before generation options existed have no `options`.
    return readList<SavedQuizSession>(KEYS.sessions).map(s => ({ ...s, options: s.options ?? DEFAULT_GENERATION_OPTIONS }));
  },
  async saveSession(session) {
    const saved: SavedQuizSession = { ...session, id: newId(), createdAt: session.createdAt ?? new Date().toISOString() };
    writeList(KEYS.sessions, [saved, ...readList<SavedQuizSession>(KEYS.sessions)].slice(0, LOCAL_LIMITS.sessions));
    return saved;
  },
  async deleteSession(id) {
    writeList(KEYS.sessions, readList<SavedQuizSession>(KEYS.sessions).filter(s => s.id !== id));
  },
  async listFlashcardSets() {
    return readList<SavedFlashcardSet>(KEYS.flashcards).map(s => ({ ...s, options: s.options ?? DEFAULT_GENERATION_OPTIONS }));
  },
  async saveFlashcardSet(set) {
    const saved: SavedFlashcardSet = { ...set, id: newId(), createdAt: set.createdAt ?? new Date().toISOString() };
    writeList(KEYS.flashcards, [saved, ...readList<SavedFlashcardSet>(KEYS.flashcards)].slice(0, LOCAL_LIMITS.flashcards));
    return saved;
  },
  async deleteFlashcardSet(id) {
    writeList(KEYS.flashcards, readList<SavedFlashcardSet>(KEYS.flashcards).filter(s => s.id !== id));
  },
  async listAttempts() {
    return readList<Attempt>(KEYS.attempts);
  },
  async recordAttempt(attempt) {
    const saved: Attempt = { ...attempt, id: newId(), createdAt: attempt.createdAt ?? new Date().toISOString() };
    writeList(KEYS.attempts, [saved, ...readList<Attempt>(KEYS.attempts)].slice(0, LOCAL_LIMITS.attempts));
    return saved;
  },
  hasData() {
    return Object.values(KEYS).some(key => readList(key).length > 0);
  },
  clear() {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  },
};

// ---------- logged-in mode: Supabase ----------

const REMOTE_LIST_LIMIT = 50;
const REMOTE_ATTEMPT_LIMIT = 500;

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`저장소 오류: ${error.message}`);
  return data as T;
}

type QuestionRow = {
  type: SavedQuizSession['questions'][number]['type'];
  question: string;
  options: string[] | null;
  answer: string;
  accepted_answers: string[] | null;
  explanation: string | null;
  concept: string | null;
};

type SetRow = {
  id: string;
  source_text: string;
  generation_options: SavedQuizSession['options'];
  answers: Record<number, string>;
  is_graded: boolean;
  correct_count: number;
  total_questions: number;
  created_at: string;
  questions?: QuestionRow[];
  flashcards?: { term: string; definition: string }[];
};

type AttemptRow = {
  id: string;
  set_id: string | null;
  generation_options: Attempt['options'];
  created_at: string;
  attempt_answers: {
    question: string;
    type: Attempt['items'][number]['type'];
    concept: string | null;
    user_answer: string;
    correct_answer: string;
    is_correct: boolean;
  }[];
};

function toSession(row: SetRow): SavedQuizSession {
  return {
    id: row.id,
    sourceText: row.source_text,
    options: row.generation_options,
    questions: (row.questions ?? []).map(q => ({
      type: q.type,
      question: q.question,
      options: q.options ?? undefined,
      answer: q.answer,
      accepted_answers: q.accepted_answers ?? undefined,
      explanation: q.explanation ?? undefined,
      concept: q.concept ?? undefined,
    })),
    answers: row.answers,
    isGraded: row.is_graded,
    createdAt: row.created_at,
    correctCount: row.correct_count,
    totalQuestions: row.total_questions,
  };
}

export function createSupabaseRepository(db: SupabaseClient): Repository {
  const deleteSet = async (id: string) => {
    unwrap(await db.from('quiz_sets').delete().eq('id', id));
  };

  return {
    async listSessions() {
      const rows = unwrap<SetRow[]>(
        await db
          .from('quiz_sets')
          .select('*, questions(*)')
          .eq('kind', 'quiz')
          .order('created_at', { ascending: false })
          .order('position', { referencedTable: 'questions' })
          .limit(REMOTE_LIST_LIMIT),
      );
      return rows.map(toSession);
    },

    async saveSession(session) {
      const set = unwrap<SetRow>(
        await db
          .from('quiz_sets')
          .insert({
            kind: 'quiz',
            source_text: session.sourceText,
            generation_options: session.options,
            answers: session.answers,
            is_graded: session.isGraded,
            correct_count: session.correctCount,
            total_questions: session.totalQuestions,
            ...(session.createdAt ? { created_at: session.createdAt } : {}),
          })
          .select()
          .single(),
      );
      const { error } = await db.from('questions').insert(
        session.questions.map((q, position) => ({
          set_id: set.id,
          position,
          type: q.type,
          question: q.question,
          options: q.options ?? null,
          answer: q.answer,
          accepted_answers: q.accepted_answers ?? null,
          explanation: q.explanation ?? null,
          concept: q.concept ?? null,
        })),
      );
      if (error) {
        await deleteSet(set.id);
        throw new Error(`저장소 오류: ${error.message}`);
      }
      return { ...toSession(set), questions: session.questions };
    },

    deleteSession: deleteSet,

    async listFlashcardSets() {
      const rows = unwrap<SetRow[]>(
        await db
          .from('quiz_sets')
          .select('*, flashcards(*)')
          .eq('kind', 'flashcard')
          .order('created_at', { ascending: false })
          .order('position', { referencedTable: 'flashcards' })
          .limit(REMOTE_LIST_LIMIT),
      );
      return rows.map(row => ({
        id: row.id,
        sourceText: row.source_text,
        options: row.generation_options,
        flashcards: (row.flashcards ?? []).map(({ term, definition }) => ({ term, definition })),
        createdAt: row.created_at,
      }));
    },

    async saveFlashcardSet(set) {
      const row = unwrap<SetRow>(
        await db
          .from('quiz_sets')
          .insert({
            kind: 'flashcard',
            source_text: set.sourceText,
            generation_options: set.options,
            total_questions: set.flashcards.length,
            ...(set.createdAt ? { created_at: set.createdAt } : {}),
          })
          .select()
          .single(),
      );
      const { error } = await db.from('flashcards').insert(
        set.flashcards.map((card, position) => ({ set_id: row.id, position, term: card.term, definition: card.definition })),
      );
      if (error) {
        await deleteSet(row.id);
        throw new Error(`저장소 오류: ${error.message}`);
      }
      return { id: row.id, sourceText: row.source_text, options: row.generation_options, flashcards: set.flashcards, createdAt: row.created_at };
    },

    deleteFlashcardSet: deleteSet,

    async listAttempts() {
      const rows = unwrap<AttemptRow[]>(
        await db
          .from('attempts')
          .select('*, attempt_answers(*)')
          .order('created_at', { ascending: false })
          .order('position', { referencedTable: 'attempt_answers' })
          .limit(REMOTE_ATTEMPT_LIMIT),
      );
      return rows.map(row => ({
        id: row.id,
        setId: row.set_id,
        options: row.generation_options,
        createdAt: row.created_at,
        items: row.attempt_answers.map(a => ({
          question: a.question,
          type: a.type,
          concept: a.concept ?? '',
          userAnswer: a.user_answer,
          correctAnswer: a.correct_answer,
          isCorrect: a.is_correct,
        })),
      }));
    },

    async recordAttempt(attempt) {
      const row = unwrap<AttemptRow>(
        await db
          .from('attempts')
          .insert({
            set_id: attempt.setId,
            generation_options: attempt.options,
            ...(attempt.createdAt ? { created_at: attempt.createdAt } : {}),
          })
          .select()
          .single(),
      );
      const { error } = await db.from('attempt_answers').insert(
        attempt.items.map((item, position) => ({
          attempt_id: row.id,
          position,
          question: item.question,
          type: item.type,
          concept: item.concept || null,
          user_answer: item.userAnswer,
          correct_answer: item.correctAnswer,
          is_correct: item.isCorrect,
        })),
      );
      if (error) {
        unwrap(await db.from('attempts').delete().eq('id', row.id));
        throw new Error(`저장소 오류: ${error.message}`);
      }
      return { id: row.id, setId: row.set_id, options: row.generation_options, createdAt: row.created_at, items: attempt.items };
    },
  };
}

// Moves guest data into the account after first login. Local attempts can't reference
// remote set ids, so their setId is dropped.
export async function migrateLocalToRemote(remote: Repository) {
  const [sessions, sets, attempts] = await Promise.all([
    localRepository.listSessions(),
    localRepository.listFlashcardSets(),
    localRepository.listAttempts(),
  ]);
  for (const { id: _id, ...s } of [...sessions].reverse()) await remote.saveSession(s);
  for (const { id: _id, ...s } of [...sets].reverse()) await remote.saveFlashcardSet(s);
  for (const { id: _id, ...a } of [...attempts].reverse()) await remote.recordAttempt({ ...a, setId: null });
  localRepository.clear();
}
