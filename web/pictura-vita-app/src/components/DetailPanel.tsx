import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EpisodeType, type ApiEpisode } from '../api/types';
import { imageUrl } from '../api/client';
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
  timelineId: string;
  /**
   * Image to show, already checked against what exists on disk. Null draws nothing at all —
   * no placeholder, no broken-image glyph — so an episode whose picture is missing looks
   * exactly like an episode that never had one.
   */
  imageName: string | null;
  onClose: () => void;
  onZoom: (start: number, end: number) => void;
  onEdit: (episode: ApiEpisode) => void;
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
  timelineId,
  imageName,
  onClose,
  onZoom,
  onEdit
}: Props) {
  const panel = useRef<HTMLElement>(null);
  const [showingFullSize, setShowingFullSize] = useState(false);

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
  }, [anchor, containerWidth, episode, imageName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape closes the full-size view first, then the panel: closing both at once would
      // dismiss the thing the reader was looking at *and* the thing they got to it from.
      if (showingFullSize) setShowingFullSize(false);
      else onClose();
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
  }, [onClose, showingFullSize]);

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

        {imageName && (
          <button
            type="button"
            className="detail-thumb"
            onClick={() => setShowingFullSize(true)}
            title="Show full size"
          >
            <img
              src={imageUrl(timelineId, imageName, 'thumb')}
              alt={episode.title}
              decoding="async"
              // The file can still go missing between the listing and this render. Hiding the
              // whole button leaves the panel looking like one with no picture, rather than
              // an empty frame around a broken image.
              onError={event => {
                event.currentTarget.closest('button')?.style.setProperty('display', 'none');
              }}
            />
          </button>
        )}

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

        <div className="detail-actions">
          <button type="button" onClick={() => onEdit(episode)}>
            Edit
          </button>

          {/* Only spans are worth zooming to. Zooming to a single-day incident would
              collapse the window to one day and show nothing but that one item. */}
          {episode.episodeType === EpisodeType.Era && (
            <button type="button" onClick={() => onZoom(start, end)}>
              Zoom to {toIso(start)} – {toIso(end)}
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <aside ref={panel} className={`detail detail-${placement}`} style={style}>
        <header>
          <h3>{episode?.title ?? item.title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        {body()}
      </aside>

      {/* The original file, not the cached thumbnail. Rendered as a sibling of the panel so
          it is not clipped by it, and dismissed by clicking anywhere — the picture is the
          only thing on screen, so there is nothing else a click could mean. */}
      {showingFullSize && imageName && (
        <div
          className="lightbox"
          role="presentation"
          onPointerDown={event => {
            event.stopPropagation();
            setShowingFullSize(false);
          }}
        >
          <img src={imageUrl(timelineId, imageName, 'full')} alt={episode?.title ?? item.title} />
        </div>
      )}
    </>
  );
}
