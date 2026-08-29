import { useMemo, useState } from 'react';
import type { ApiTimeline } from '../api/types';
import { toLayoutCategory, toLayoutEpisode } from '../api/adapter';
import { buildLayout, deriveWindow, toIso, type DayNumber, type TimeItem } from '../layout';
import { useElementWidth } from '../hooks/useElementWidth';
import { AxisRow } from './AxisRow';
import { Band } from './Band';
import { DetailPanel } from './DetailPanel';

interface Props {
  timeline: ApiTimeline;
  today: DayNumber;
}

export function TimelineView({ timeline, today }: Props) {
  const [surfaceRef, width] = useElementWidth<HTMLDivElement>();
  const [zoom, setZoom] = useState<{ floor: DayNumber; ceiling: DayNumber } | null>(null);
  const [selected, setSelected] = useState<TimeItem | null>(null);

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
    <div className="timeline">
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
                selectedKey={selected?.key ?? null}
                onSelect={setSelected}
              />
            ))}
            <AxisRow increments={layout.axis} onZoom={onZoom} />
          </>
        )}
      </div>

      {selected && (
        <DetailPanel
          item={selected}
          episode={
            selected.supplementOf
              ? byId.get(selected.supplementOf)
              : selected.episodeId
                ? byId.get(selected.episodeId)
                : undefined
          }
          onClose={() => setSelected(null)}
          onZoom={onZoom}
        />
      )}
    </div>
  );
}
