import { useCallback, useMemo, useRef, useState } from 'react';
import type { ApiTimeline } from '../api/types';
import { toLayoutCategory, toLayoutEpisode } from '../api/adapter';
import { buildLayout, deriveWindow, toIso, type DayNumber, type TimeItem } from '../layout';
import { useElementWidth } from '../hooks/useElementWidth';
import { AxisRow } from './AxisRow';
import { Band } from './Band';
import { DetailPanel, type Anchor } from './DetailPanel';

interface Props {
  timeline: ApiTimeline;
  today: DayNumber;
}

export function TimelineView({ timeline, today }: Props) {
  const [surfaceRef, width] = useElementWidth<HTMLDivElement>();
  const container = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ floor: DayNumber; ceiling: DayNumber } | null>(null);
  const [selected, setSelected] = useState<{ item: TimeItem; anchor: Anchor } | null>(null);

  // Anchor coordinates are taken relative to the timeline container rather than the
  // viewport, so the panel stays attached to its item as the page scrolls.
  const select = useCallback((item: TimeItem, element: HTMLElement) => {
    const root = container.current;
    if (!root) return;

    const itemRect = element.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    setSelected({
      item,
      anchor: {
        x: itemRect.left - rootRect.left,
        y: itemRect.top - rootRect.top,
        width: itemRect.width,
        height: itemRect.height
      }
    });
  }, []);

  const episodes = useMemo(() => timeline.episodes.map(toLayoutEpisode), [timeline]);
  const categories = useMemo(() => timeline.categories.map(toLayoutCategory), [timeline]);

  const byId = useMemo(
    () => new Map(timeline.episodes.map(episode => [episode.episodeId, episode])),
    [timeline]
  );

  const window = useMemo(() => zoom ?? deriveWindow(episodes, today), [zoom, episodes, today]);

  const layout = useMemo(
    () => buildLayout({ episodes, categories, ...window, totalWidth: width }),
    [episodes, categories, window, width]
  );

  // Zooming is pure client-side recomputation. The original refetched from the server
  // on every zoom; the layout is a pure function, so there is nothing to fetch.
  const onZoom = (floor: DayNumber, ceiling: DayNumber) => {
    setZoom({ floor, ceiling });
    setSelected(null);
  };

  return (
    <div className="timeline" ref={container}>
      <div className="toolbar">
        <span className="range">
          {toIso(window.floor)} – {toIso(window.ceiling)}
          <span className="muted"> · {layout.totalDays.toLocaleString()} days</span>
        </span>
        {zoom && (
          <button type="button" onClick={() => setZoom(null)}>
            Reset zoom
          </button>
        )}
      </div>

      <div className="surface" ref={surfaceRef}>
        {width === 0 ? null : layout.isEmpty ? (
          <p className="empty">Nothing falls within this range.</p>
        ) : (
          <>
            <AxisRow increments={layout.axis} onZoom={onZoom} />
            {layout.bands.map(band => (
              <Band
                key={band.categoryId}
                band={band}
                selectedKey={selected?.item.key ?? null}
                onSelect={select}
              />
            ))}
            <AxisRow increments={layout.axis} onZoom={onZoom} />
          </>
        )}
      </div>

      {selected && (
        <DetailPanel
          key={selected.item.key}
          item={selected.item}
          episode={
            selected.item.supplementOf
              ? byId.get(selected.item.supplementOf)
              : selected.item.episodeId
                ? byId.get(selected.item.episodeId)
                : undefined
          }
          anchor={selected.anchor}
          containerWidth={width}
          onClose={() => setSelected(null)}
          onZoom={onZoom}
        />
      )}
    </div>
  );
}
