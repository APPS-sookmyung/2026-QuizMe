import { useMemo, useState } from 'react';
import type { Attempt } from '../types/quiz';
import { QUESTION_TYPE_LABELS } from '../shared/generation';
import {
  accuracyOf,
  buildTimeline,
  computeStats,
  filterByRange,
  previousPeriod,
  RANGE_LABELS,
  WEAK_ACCURACY_BELOW,
  WEAK_MIN_ATTEMPTS,
  type RangeKey,
  type Tally,
  type TimelinePoint,
} from '../lib/analytics';

type Props = {
  attempts: Attempt[];
  isLoading: boolean;
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function StatsDashboard({ attempts, isLoading }: Props) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [showTable, setShowTable] = useState(false);

  const { stats, timeline, delta } = useMemo(() => {
    const now = new Date();
    const inRange = filterByRange(attempts, range, now);
    const stats = computeStats(inRange);
    const prev = previousPeriod(attempts, range, now);
    const prevStats = prev && prev.length ? computeStats(prev) : null;
    return {
      stats,
      timeline: buildTimeline(inRange, range, now),
      delta: prevStats && stats.overall.total
        ? accuracyOf(stats.overall) - accuracyOf(prevStats.overall)
        : null,
    };
  }, [attempts, range]);

  return (
    <div className={`panel stats ${isLoading ? 'is-refreshing' : ''}`}>
      <h2 className="panel-title">학습 분석</h2>

      <div className="stats-filter" role="group" aria-label="기간">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map(key => (
          <button
            key={key}
            type="button"
            className={`filter-btn ${range === key ? 'active' : ''}`}
            aria-pressed={range === key}
            onClick={() => setRange(key)}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>

      {stats.overall.total === 0 ? (
        <p className="sub stats-empty">
          {attempts.length === 0
            ? '아직 풀이 기록이 없어요. 퀴즈를 풀고 채점하면 여기에 쌓여요.'
            : `${RANGE_LABELS[range]} 동안의 풀이 기록이 없어요.`}
        </p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile hero">
              <div className="stat-label">정답률</div>
              <div className="stat-value">{pct(accuracyOf(stats.overall))}</div>
              {delta !== null && (
                <div className={`stat-delta ${delta >= 0 ? 'up' : 'down'}`}>
                  <span aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</span>{' '}
                  {Math.abs(Math.round(delta * 100))}%p · 이전 {RANGE_LABELS[range].replace('최근 ', '')} 대비
                </div>
              )}
            </div>
            <div className="stat-tile">
              <div className="stat-label">푼 문제</div>
              <div className="stat-value">{stats.overall.total.toLocaleString()}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">채점 횟수</div>
              <div className="stat-value">{stats.attemptCount.toLocaleString()}</div>
            </div>
          </div>

          <section className="stats-card">
            <div className="stats-card-head">
              <h3>{range === 'all' ? '주별 정답률' : '일별 정답률'}</h3>
              <button type="button" className="link-btn" onClick={() => setShowTable(v => !v)}>
                {showTable ? '차트로 보기' : '표로 보기'}
              </button>
            </div>
            {showTable ? <TimelineTable points={timeline} /> : <AccuracyColumns points={timeline} />}
          </section>

          <section className="stats-card">
            <div className="stats-card-head">
              <h3>약점 개념</h3>
            </div>
            <p className="stats-note">
              {WEAK_MIN_ATTEMPTS}번 이상 나왔고 정답률이 {pct(WEAK_ACCURACY_BELOW)} 미만인 개념이에요.
            </p>
            {stats.weakConcepts.length ? (
              <ul className="meter-list">
                {stats.weakConcepts.map(c => (
                  <li key={c.name}>
                    <MeterRow label={c.name} tally={c} />
                    {c.lastWrong && <div className="meter-detail">최근 오답: {c.lastWrong.question}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sub">
                {stats.conceptCount === 0
                  ? '개념 정보가 있는 문제를 아직 풀지 않았어요. 새로 생성한 퀴즈부터 개념이 기록돼요.'
                  : '지금은 약점으로 볼 만한 개념이 없어요.'}
              </p>
            )}
          </section>

          <section className="stats-card">
            <div className="stats-card-head">
              <h3>유형별 정답률</h3>
            </div>
            <ul className="meter-list">
              {stats.byType.map(t => (
                <li key={t.type}>
                  <MeterRow label={QUESTION_TYPE_LABELS[t.type]} tally={t} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function MeterRow({ label, tally }: { label: string; tally: Tally }) {
  const accuracy = accuracyOf(tally);
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <span className="meter-track" role="img" aria-label={`${label} 정답률 ${pct(accuracy)}`}>
        <span className="meter-fill" style={{ width: pct(accuracy) }} />
      </span>
      <span className="meter-value">
        {pct(accuracy)} <span className="muted">· {tally.correct}/{tally.total}</span>
      </span>
    </div>
  );
}

function AccuracyColumns({ points }: { points: TimelinePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="columns-chart">
      <div className="columns-y" aria-hidden="true">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <div className="columns-plot">
        <div className="columns-grid" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="columns-row">
          {points.map((p, i) => {
            const accuracy = accuracyOf(p);
            const description = p.total ? `${p.tooltipLabel} 정답률 ${pct(accuracy)}, ${p.total}문제 중 ${p.correct}개 정답` : `${p.tooltipLabel} 기록 없음`;
            return (
              <div
                key={p.key}
                className={`column-slot ${hovered === i ? 'hovered' : ''}`}
                tabIndex={0}
                aria-label={description}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              >
                {p.total > 0 && (
                  <div className="column-bar" style={{ height: accuracy > 0 ? pct(accuracy) : '2px' }} />
                )}
                {hovered === i && (
                  <div className="chart-tooltip" role="presentation">
                    {p.total ? (
                      <>
                        <strong>{pct(accuracy)}</strong>
                        <span>{p.correct}/{p.total} 정답 · {p.tooltipLabel}</span>
                      </>
                    ) : (
                      <span>{p.tooltipLabel} · 기록 없음</span>
                    )}
                  </div>
                )}
                <span className="column-x">
                  {i % labelEvery === 0 || i === points.length - 1 ? p.label : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimelineTable({ points }: { points: TimelinePoint[] }) {
  const rows = points.filter(p => p.total > 0).reverse();
  return (
    <div className="table-scroll">
      <table className="stats-table">
        <thead>
          <tr>
            <th scope="col">기간</th>
            <th scope="col">푼 문제</th>
            <th scope="col">정답</th>
            <th scope="col">정답률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.key}>
              <td>{p.tooltipLabel}</td>
              <td>{p.total}</td>
              <td>{p.correct}</td>
              <td>{pct(accuracyOf(p))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
