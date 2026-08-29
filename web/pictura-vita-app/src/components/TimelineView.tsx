import { useCallback, useMemo, useRef, useState } from 'react';
import type { ApiEpisode, ApiTimeline } from '../api/types';
import { toLayoutCategory, toLayoutEpisode } from '../api/adapter';
import {
  buildLayout,
  Confidentiality,
  MAX_DATE_ISO,
  toDayNumber,
  toIso,
  type DayNumber,
  type ResolvedConfidentiality,
  type TimeItem
} from '../layout';
import { useElementWidth } from '../hooks/useElementWidth';
import { AxisRow } from './AxisRow';
import { Band } from './Band';
import { DetailPanel, type Anchor } from './DetailPanel';
import { EpisodeDialog } from './EpisodeDialog';
import { FilterControls } from './FilterControls';

interface Props {
  timeline: ApiTimeline;
  today: DayNumber;
  /** Called after an edit lands, so the owner can refetch. */
  onChanged: () => void;
}

export function TimelineView({ timeline, today, onChanged }: Props) {
  const [surfaceRef, width] = useElementWidth<HTMLDivElement>();
  const container = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ floor: DayNumber; ceiling: DayNumber } | null>(null);
  const [maxConfidentiality, setMaxConfidentiality] = useState<ResolvedConfidentiality>(
    Confidentiality.OnlyMe
  );
  // Tracked as hidden rather than visible so a category added later shows up by default.
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<{ item: TimeItem; anchor: Anchor } | null>(null);
  const [editing, setEditing] = useState<ApiEpisode | null>(null);

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

  // The timeline's own start and end are authoritative: they are what "Edit timeline info"
  // changes, and an ongoing timeline runs to today rather than to a date frozen at import.
  // Episodes outside the window are dropped by the layout, exactly as the original's
  // configurable floor and ceiling did.
  const window = useMemo(() => {
    if (zoom) return zoom;

    const { start, end, ongoing } = timeline.timelineInfo;
    return {
      floor: toDayNumber(start),
      ceiling: ongoing || end === MAX_DATE_ISO ? today : toDayNumber(end)
    };
  }, [zoom, timeline, today]);

  const visibleCategoryIds = useMemo(
    () =>
      hiddenCategoryIds.size === 0
        ? null
        : new Set(
            categories
              .map(category => category.categoryId)
              .filter(id => !hiddenCategoryIds.has(id))
          ),
    [categories, hiddenCategoryIds]
  );

  const layout = useMemo(
    () =>
      buildLayout({
        episodes,
        categories,
        ...window,
        maxConfidentiality,
        visibleCategoryIds,
        totalWidth: width
      }),
    [episodes, categories, window, maxConfidentiality, visibleCategoryIds, width]
  );

  const toggleCategory = useCallback((categoryId: string) => {
    setHiddenCategoryIds(current => {
      const next = new Set(current);
      if (!next.delete(categoryId)) next.add(categoryId);
      return next;
    });
  }, []);

  const setAllCategories = useCallback(
    (visible: boolean) =>
      setHiddenCategoryIds(
        visible ? new Set() : new Set(categories.map(category => category.categoryId))
      ),
    [categories]
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
          <span className="muted">
            {' '}
            · {layout.totalDays.toLocaleString()} {layout.totalDays === 1 ? 'day' : 'days'}
          </span>
        </span>

        <FilterControls
          categories={categories}
          hiddenCategoryIds={hiddenCategoryIds}
          onToggleCategory={toggleCategory}
          onSetAllCategories={setAllCategories}
          maxConfidentiality={maxConfidentiality}
          onConfidentialityChange={setMaxConfidentiality}
        />

        {zoom && (
          <button type="button" onClick={() => setZoom(null)}>
            Reset zoom
          </button>
        )}
      </div>

      <div className="surface" ref={surfaceRef}>
        {width === 0 ? null : layout.isEmpty ? (
          <p className="empty">
            {hiddenCategoryIds.size === categories.length && categories.length > 0
              ? 'No categories are selected.'
              : 'Nothing matches the current filters.'}
          </p>
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
          today={today}
          onClose={() => setSelected(null)}
          onZoom={onZoom}
          onEdit={episodeToEdit => {
            setSelected(null);
            setEditing(episodeToEdit);
          }}
        />
      )}

      {editing && (
        <EpisodeDialog
          timeline={timeline}
          episode={editing}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
