import type { ApiTimelineSummary } from '../api/types';
import { MAX_DATE_ISO, toDayNumber, type DayNumber } from '../layout';
import { describeGap } from './elapsed';
import { toHash } from '../hooks/useHashRoute';

interface Props {
  summaries: readonly ApiTimelineSummary[];
  today: DayNumber;
  onCreate: () => void;
}

/**
 * The table of contents: everything found in the timelines directory.
 *
 * Each card is one directory on disk. Nothing here is read from an index file — the server
 * lists what is actually there — so a timeline restored from a backup or handed over by
 * someone else appears simply by being put in the directory, with nothing to register it
 * with and nothing to go stale.
 */
export function TimelineIndex({ summaries, today, onCreate }: Props) {
  if (summaries.length === 0) {
    return (
      <section className="timeline-index empty">
        <h2>No timelines yet</h2>
        <p>
          <button type="button" className="primary" onClick={onCreate}>
            New timeline
          </button>
        </p>
        <p className="muted">
          Nothing was found in the timelines directory. Each timeline is one folder there,
          named for its id, holding <code>data.v1.json</code> alongside its{' '}
          <code>images</code> and <code>narratives</code>. Drop one in and reload, or run the
          migration if you are coming from a single <code>timeline-data.json</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="timeline-index">
      <p className="timeline-index-actions">
        <button type="button" className="primary" onClick={onCreate}>
          New timeline
        </button>
      </p>
      <ul>
        {summaries.map(summary => (
          <li key={summary.timelineId}>
            <a className="timeline-card" href={toHash({ kind: 'timeline', timelineId: summary.timelineId })}>
              <h2>{summary.title}</h2>
              {summary.subtitle && <p className="muted">{summary.subtitle}</p>}
              <p className="timeline-card-span">{describeSpan(summary, today)}</p>
              <p className="timeline-card-counts muted">
                {count(summary.episodeCount, 'episode')} in {count(summary.categoryCount, 'category', 'categories')}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The years a timeline covers, and how long that is.
 *
 * An ongoing timeline stores the 9999-12-31 sentinel rather than a real end date, so it is
 * measured to today and labelled for it — the same rule the layout draws by.
 */
function describeSpan(summary: ApiTimelineSummary, today: DayNumber): string {
  const start = toDayNumber(summary.start);
  const end = summary.ongoing || summary.end === MAX_DATE_ISO ? today : toDayNumber(summary.end);

  const from = summary.start.slice(0, 4);
  const to = summary.ongoing || summary.end === MAX_DATE_ISO ? 'now' : summary.end.slice(0, 4);

  return `${from} – ${to} · ${describeGap(start, end)}`;
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
