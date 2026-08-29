import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EpisodeType, type ApiEpisode } from '../api/types';
import { toIso, toDayNumber, daySpan, type DayNumber, type TimeItem } from '../layout';
import { describeGap, gapLabel } from './elapsed';

/** Position and size of the clicked item, relative to the timeline container. */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  item: TimeItem;
  episode: ApiEpisode | undefined;
  anchor: Anchor;
  containerWidth: number;
  /** Passed in rather than read from the clock, so the panel renders deterministically. */
  today: DayNumber;
  onClose: () => void;
  onZoom: (start: number, end: number) => void;
}

/** Distance between the item and the panel pointing at it. */
const GAP = 10;

function formatDate(iso: string): string {
  const { 0: year, 1: month, 2: day } = iso.split('-');
  return `${month}/${day}/${year}`;
}

function years(days: number): string {
  return (days / 365.2425).toFixed(2);
}

export function DetailPanel({
  item,
  episode,
  anchor,
  containerWidth,
  today,
  onClose,
  onZoom
}: Props) {
  const panel = useRef<HTMLElement>(null);

  // Hidden for the first paint so the panel is never seen at its pre-measurement position.
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const [placement, setPlacement] = useState<'above' | 'below'>('above');

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();

    // Centre on the item, then keep the whole panel inside the timeline.
    const centred = anchor.x + anchor.width / 2 - width / 2;
    const left = Math.max(0, Math.min(centred, Math.max(0, containerWidth - width)));

    // Prefer above, as the original did; drop below only when there is no room.
    const above = anchor.y - height - GAP;
    const fitsAbove = above >= 0;

    setPlacement(fitsAbove ? 'above' : 'below');
    setStyle({
      left: `${left}px`,
      top: `${fitsAbove ? above : anchor.y + anchor.height + GAP}px`
    });
  }, [anchor, containerWidth, episode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // A click on another timeline item should move the panel, not close it.
      if (panel.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.era, .incident')) return;
      onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const body = () => {
    if (!episode) {
      return (
        <p className="muted">
          A reference bar, drawn because this category has only moments and no spans.
        </p>
      );
    }

    const start = toDayNumber(episode.start);
    const end = episode.indefinite ? item.end : toDayNumber(episode.end);
    const duration = daySpan(start, end);
    const isIncident = episode.episodeType !== EpisodeType.Era;

    return (
      <>
        {episode.subtitle && <p className="subtitle">{episode.subtitle}</p>}

        <dl>
          <dt>Dates</dt>
          <dd>
            {formatDate(episode.start)}
            {episode.indefinite
              ? ' — ongoing'
              : episode.end !== episode.start && ` — ${formatDate(episode.end)}`}
          </dd>

          {/* An incident starts and ends on the same day, so a second identical row would
              say nothing; it gets one unqualified gap instead. */}
          {isIncident ? (
            <>
              <dt>{gapLabel('', start, today).trim()}</dt>
              <dd>{describeGap(start, today)}</dd>
            </>
          ) : (
            <>
              <dt>{gapLabel('start', start, today)}</dt>
              <dd>{describeGap(start, today)}</dd>

              {!episode.indefinite && (
                <>
                  <dt>{gapLabel('end', end, today)}</dt>
                  <dd>{describeGap(end, today)}</dd>
                </>
              )}
            </>
          )}

          {/* A single-day incident has no duration worth stating; "1 day" only restates
              the date already shown above it. */}
          {episode.episodeType === EpisodeType.Era && (
            <>
              <dt>Duration</dt>
              <dd>
                {duration.toLocaleString()} {duration === 1 ? 'day' : 'days'}
                {duration > 365 && ` (${years(duration)} years)`}
              </dd>
            </>
          )}
        </dl>

        {episode.description && <p className="description">{episode.description}</p>}

        {episode.url && (
          <p className="external">
            <a href={episode.url} target="_blank" rel="noreferrer noopener">
              {episode.urlDescription || episode.url}
            </a>
          </p>
        )}

        {/* Only spans are worth zooming to. Zooming to a single-day incident would
            collapse the window to one day and show nothing but that one item. */}
        {episode.episodeType === EpisodeType.Era && (
          <button type="button" className="zoom" onClick={() => onZoom(start, end)}>
            Zoom to {toIso(start)} – {toIso(end)}
          </button>
        )}
      </>
    );
  };

  return (
    <aside ref={panel} className={`detail detail-${placement}`} style={style}>
      <header>
        <h3>{episode?.title ?? item.title}</h3>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>
      {body()}
    </aside>
  );
}
