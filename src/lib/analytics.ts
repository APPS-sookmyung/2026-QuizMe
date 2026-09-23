import { QUESTION_TYPES, type QuestionType } from '../shared/generation';
import type { Attempt, AttemptItem } from '../types/quiz';

export type RangeKey = '7d' | '30d' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = { '7d': '최근 7일', '30d': '최근 30일', all: '전체' };

export const WEAK_MIN_ATTEMPTS = 2;
export const WEAK_ACCURACY_BELOW = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WEEKS = 26;
const RANGE_DAYS = { '7d': 7, '30d': 30 } as const;

export type Tally = { total: number; correct: number };

export type TimelinePoint = Tally & { key: string; label: string; tooltipLabel: string };

export type ConceptStat = Tally & { name: string; lastWrong?: AttemptItem };

export function accuracyOf(t: Tally) {
  return t.total ? t.correct / t.total : 0;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function tally(items: AttemptItem[]): Tally {
  return { total: items.length, correct: items.filter(i => i.isCorrect).length };
}

function rangeStart(range: Exclude<RangeKey, 'all'>, now: Date) {
  return startOfDay(now).getTime() - (RANGE_DAYS[range] - 1) * DAY_MS;
}

export function filterByRange(attempts: Attempt[], range: RangeKey, now = new Date()) {
  if (range === 'all') return attempts;
  const start = rangeStart(range, now);
  return attempts.filter(a => new Date(a.createdAt).getTime() >= start);
}

// The equally long window right before the selected one, for the delta on the stat tile.
export function previousPeriod(attempts: Attempt[], range: RangeKey, now = new Date()) {
  if (range === 'all') return null;
  const end = rangeStart(range, now);
  const start = end - RANGE_DAYS[range] * DAY_MS;
  return attempts.filter(a => {
    const t = new Date(a.createdAt).getTime();
    return t >= start && t < end;
  });
}

export function buildTimeline(attempts: Attempt[], range: RangeKey, now = new Date()): TimelinePoint[] {
  const byBucket = new Map<number, AttemptItem[]>();
  const bucketOf = range === 'all' ? startOfWeek : startOfDay;
  for (const a of attempts) {
    const key = bucketOf(new Date(a.createdAt)).getTime();
    const bucket = byBucket.get(key) ?? [];
    bucket.push(...a.items);
    byBucket.set(key, bucket);
  }

  const buckets: Date[] = [];
  if (range === 'all') {
    if (attempts.length === 0) return [];
    const earliest = Math.min(...attempts.map(a => new Date(a.createdAt).getTime()));
    const cursor = startOfWeek(new Date(earliest));
    const last = startOfWeek(now);
    while (cursor <= last) {
      buckets.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    for (let i = RANGE_DAYS[range] - 1; i >= 0; i -= 1) {
      const d = startOfDay(now);
      d.setDate(d.getDate() - i);
      buckets.push(d);
    }
  }

  return (range === 'all' ? buckets.slice(-MAX_WEEKS) : buckets).map(d => {
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      key: String(d.getTime()),
      label,
      tooltipLabel: range === 'all' ? `${label} 주` : label,
      ...tally(byBucket.get(d.getTime()) ?? []),
    };
  });
}

function conceptKey(concept: string) {
  return concept.trim().toLowerCase().replace(/\s+/g, '');
}

export function computeStats(attempts: Attempt[]) {
  const chronological = [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items = chronological.flatMap(a => a.items);

  const byType: (Tally & { type: QuestionType })[] = QUESTION_TYPES
    .map(type => ({ type, ...tally(items.filter(i => i.type === type)) }))
    .filter(t => t.total > 0);

  const concepts = new Map<string, ConceptStat>();
  for (const item of items) {
    const key = conceptKey(item.concept);
    if (!key) continue;
    const stat = concepts.get(key) ?? { name: item.concept.trim(), total: 0, correct: 0 };
    stat.name = item.concept.trim();
    stat.total += 1;
    if (item.isCorrect) stat.correct += 1;
    else stat.lastWrong = item;
    concepts.set(key, stat);
  }

  const weakConcepts = [...concepts.values()]
    .filter(c => c.total >= WEAK_MIN_ATTEMPTS && accuracyOf(c) < WEAK_ACCURACY_BELOW)
    .sort((a, b) => accuracyOf(a) - accuracyOf(b) || b.total - a.total)
    .slice(0, 6);

  return {
    overall: tally(items),
    attemptCount: attempts.length,
    byType,
    weakConcepts,
    conceptCount: concepts.size,
  };
}
