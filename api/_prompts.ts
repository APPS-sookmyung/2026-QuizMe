import {
  DIFFICULTIES,
  MAX_QUESTION_COUNT,
  MAX_SOURCE_CHARS_PER_REQUEST,
  MIN_SOURCE_CHARS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type GenerationKind,
  type GenerationOptions,
  type QuestionType,
} from '../src/shared/generation';

export type GenerateRequest = {
  kind: GenerationKind;
  sourceText: string;
  options: GenerationOptions;
};

export function parseGenerateRequest(body: unknown): GenerateRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const opts = (b.options ?? {}) as Record<string, unknown>;

  const kind = b.kind;
  if (kind !== 'quiz' && kind !== 'flashcard') return 'kind가 올바르지 않습니다.';

  const sourceText = typeof b.sourceText === 'string' ? b.sourceText.trim() : '';
  if (sourceText.length < MIN_SOURCE_CHARS) return '학습 자료가 너무 짧습니다.';
  if (sourceText.length > MAX_SOURCE_CHARS_PER_REQUEST) return '학습 자료가 한 번에 처리할 수 있는 길이를 넘었습니다.';

  const difficulty = opts.difficulty as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) return '난이도가 올바르지 않습니다.';

  const questionCount = opts.questionCount;
  if (typeof questionCount !== 'number' || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_QUESTION_COUNT) {
    return `문제 수는 1~${MAX_QUESTION_COUNT} 사이여야 합니다.`;
  }

  const rawTypes = Array.isArray(opts.questionTypes) ? opts.questionTypes : [];
  const questionTypes = QUESTION_TYPES.filter(t => rawTypes.includes(t));
  if (kind === 'quiz' && questionTypes.length === 0) return '문제 유형을 하나 이상 선택해주세요.';

  return { kind, sourceText, options: { difficulty, questionCount, questionTypes } };
}

const DIFFICULTY_GUIDES: Record<Difficulty, string> = {
  easy: '자료에 명시된 정의·사실을 그대로 확인하는 문제. 오답 보기는 명확하게 틀린 것으로.',
  medium: '개념을 이해했는지 확인하는 문제. 자료의 표현을 그대로 베끼지 말고 바꿔서 물을 것.',
  hard: '개념 간 비교·적용·추론이 필요한 문제. 오답 보기는 그럴듯해서 헷갈리도록.',
};

const TYPE_RULES: Record<QuestionType, string> = {
  multiple_choice: '- multiple_choice: options에 보기 4개, answer는 그중 하나와 정확히 일치',
  ox: '- ox: answer는 "O" 또는 "X"',
  short_answer: '- short_answer: answer는 가장 대표적인 정답, accepted_answers에 동의어/유사 표현(최대 3개)',
};

export function buildQuizPrompt({ sourceText, options }: GenerateRequest) {
  const typeNames = options.questionTypes.map(t => QUESTION_TYPE_LABELS[t]).join(', ');
  const mix = options.questionTypes.length > 1 ? ' (선택된 유형을 골고루 섞을 것)' : '';

  return `당신은 학습 자료를 바탕으로 퀴즈를 만드는 도우미입니다.
아래 [학습자료]를 읽고 핵심 개념을 확인할 수 있는 문제를 정확히 ${options.questionCount}개 만드세요.
문제 유형: ${typeNames}${mix}
난이도: ${DIFFICULTY_GUIDES[options.difficulty]}

${options.questionTypes.map(t => TYPE_RULES[t]).join('\n')}
- explanation은 한두 문장으로 간단히
- concept: 이 문제가 확인하는 핵심 개념 이름 (2~15자 명사구, 예: "명반응"). 같은 개념은 항상 같은 표현으로 쓸 것

[학습자료]
${sourceText}`;
}

export function buildFlashcardPrompt({ sourceText, options }: GenerateRequest) {
  return `당신은 학습 자료를 바탕으로 플래시카드를 만드는 도우미입니다.
아래 [학습자료]를 읽고 핵심 개념과 그 정의를 짧고 명확하게 묶어서 ${options.questionCount}개의 플래시카드를 만드세요.
난이도: ${DIFFICULTY_GUIDES[options.difficulty]}

[학습자료]
${sourceText}`;
}

export function quizSchema(questionTypes: QuestionType[]) {
  return {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: questionTypes },
        question: { type: 'STRING' },
        options: { type: 'ARRAY', items: { type: 'STRING' } },
        answer: { type: 'STRING' },
        accepted_answers: { type: 'ARRAY', items: { type: 'STRING' } },
        explanation: { type: 'STRING' },
        concept: { type: 'STRING' },
      },
      required: ['type', 'question', 'answer', 'concept'],
    },
  };
}

export const FLASHCARD_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      term: { type: 'STRING' },
      definition: { type: 'STRING' },
    },
    required: ['term', 'definition'],
  },
};
