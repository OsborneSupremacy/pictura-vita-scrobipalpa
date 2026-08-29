import type { ApiEpisode } from '../api/types';
import { toIso, toDayNumber, daySpan, type TimeItem } from '../layout';

interface Props {
  item: TimeItem;
  episode: ApiEpisode | undefined;
  onClose: () => void;
  onZoom: (start: number, end: number) => void;
}

function formatDate(iso: string): string {
  const { 0: year, 1: month, 2: day } = iso.split('-');
  return `${month}/${day}/${year}`;
}

function years(days: number): string {
  return (days / 365.2425).toFixed(2);
}

export function DetailPanel({ item, episode, onClose, onZoom }: Props) {
  if (!episode) {
    return (
      <aside className="detail">
        <header>
          <h3>{item.title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p className="muted">
          A reference bar, drawn because this category has only moments and no spans.
        </p>
      </aside>
    );
  }

  const start = toDayNumber(episode.start);
  const end = episode.indefinite ? item.end : toDayNumber(episode.end);
  const duration = daySpan(start, end);

  return (
    <aside className="detail">
      <header>
        <h3>{episode.title}</h3>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>

      {episode.subtitle && <p className="subtitle">{episode.subtitle}</p>}

      <dl>
        <dt>Dates</dt>
        <dd>
          {formatDate(episode.start)}
          {episode.indefinite
            ? ' — ongoing'
            : episode.end !== episode.start && ` — ${formatDate(episode.end)}`}
        </dd>

        <dt>Duration</dt>
        <dd>
          {duration.toLocaleString()} {duration === 1 ? 'day' : 'days'}
          {duration > 365 && ` (${years(duration)} years)`}
        </dd>
      </dl>

      {episode.description && <p className="description">{episode.description}</p>}

      {episode.url && (
        <p className="external">
          <a href={episode.url} target="_blank" rel="noreferrer noopener">
            {episode.urlDescription || episode.url}
          </a>
        </p>
      )}

      <button type="button" className="zoom" onClick={() => onZoom(start, end)}>
        Zoom to {toIso(start)} – {toIso(end)}
      </button>
    </aside>
  );
}
