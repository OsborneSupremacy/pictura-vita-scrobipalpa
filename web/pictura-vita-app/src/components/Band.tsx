import type { CSSProperties } from 'react';
import { Pencil } from 'lucide-react';
import type { CategoryBand, Rail, TimeItem } from '../layout';
import { CategoryIcon } from '../icons/CategoryIcon';
import { imageUrl } from '../api/client';
import { barStyle } from '../color/contrast';
import { fallbackColor } from '../color/palette';

interface Props {
  band: CategoryBand;
  timelineId: string;
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
  onAdd: (categoryId: string) => void;
  onEditDescription: (categoryId: string) => void;
}

function itemClassName(item: TimeItem, selected: boolean): string {
  return [
    item.kind === 'placeholder' ? 'placeholder' : item.kind,
    item.sliver ? 'sliver' : '',
    item.fromPast ? 'from-past' : '',
    item.intoFuture ? 'into-future' : '',
    item.reference ? 'reference' : '',
    selected ? 'selected' : ''
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The line joining a callout to the bar it points at.
 *
 * It is drawn at the callout's anchor offset rather than at its midpoint, because a callout
 * nudged away from the edge of the window no longer sits over the date it marks. Its length
 * is derived from how many callout rails sit between this one and the era rails, so it
 * reaches the bar however deeply the callouts are stacked — the original drew a fixed 8px
 * triangle that only ever touched when a callout happened to be on the nearest rail.
 */
function Connector({
  item,
  direction,
  calloutRailsToCross,
  eraRailCount
}: {
  item: TimeItem;
  direction: 'up' | 'down';
  calloutRailsToCross: number;
  eraRailCount: number;
}) {
  // A real incident has no particular bar to reach, so it stops at the nearest era rail.
  const target = item.targetRailIndex ?? (direction === 'down' ? 0 : eraRailCount - 1);

  const eraRailsToCross =
    direction === 'down' ? target : eraRailCount - 1 - target;

  const style = {
    left: `${item.anchorOffset}px`,
    '--callout-rails': calloutRailsToCross,
    '--era-rails': Math.max(0, eraRailsToCross)
  } as CSSProperties;

  return <span className={`connector connector-${direction}`} style={style} aria-hidden="true" />;
}

function ItemBox({
  item,
  timelineId,
  selected,
  onSelect
}: {
  item: TimeItem;
  timelineId: string;
  selected: boolean;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
}) {
  if (item.kind === 'placeholder') {
    return <div className="placeholder" style={{ width: `${item.width}px` }} />;
  }

  return (
    <button
      type="button"
      className={itemClassName(item, selected)}
      style={{ width: `${item.width}px` }}
      title={item.title}
      onClick={event => onSelect(item, event.currentTarget)}
    >
      {/* The layout has already decided this: it is non-null only for an image that exists
          in a box wide enough to hold it. The onError is for the narrow case where the file
          is removed between listing and drawing — it leaves a gap rather than the browser's
          broken-image glyph, so a missing picture looks like no picture. */}
      {item.imageName && (
        <img
          className="item-thumb"
          src={imageUrl(timelineId, item.imageName, 'thumb')}
          alt=""
          loading="lazy"
          decoding="async"
          onError={event => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}

      {!item.sliver && (
        <span className="labels">
          <span className="title">{item.title}</span>
          {item.subtitle && <span className="subtitle">{item.subtitle}</span>}
        </span>
      )}
    </button>
  );
}

function RailRow({
  rail,
  timelineId,
  connect,
  calloutRailsToCross = 0,
  eraRailCount = 1,
  selectedKey,
  onSelect
}: {
  rail: Rail;
  timelineId: string;
  connect?: 'up' | 'down';
  calloutRailsToCross?: number;
  eraRailCount?: number;
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
}) {
  return (
    <div className={`rail rail-${rail.kind}`}>
      {/* Behind the cells rather than among them: it spans the whole window, which the
          rail's own widths already do between them. */}
      {rail.reference && (
        <div className="rail-underlay">
          <ItemBox
            item={rail.reference}
            timelineId={timelineId}
            selected={rail.reference.key === selectedKey}
            onSelect={onSelect}
          />
        </div>
      )}

      {rail.items.map(item => (
        <div key={item.key} className="rail-cell" style={{ width: `${item.width}px` }}>
          <ItemBox
            item={item}
            timelineId={timelineId}
            selected={item.key === selectedKey}
            onSelect={onSelect}
          />
          {connect && item.kind !== 'placeholder' && (
            <Connector
              item={item}
              direction={connect}
              calloutRailsToCross={calloutRailsToCross}
              eraRailCount={eraRailCount}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function Band({ band, timelineId, selectedKey, onSelect, onAdd, onEditDescription }: Props) {
  // A stored colour wins; otherwise the band falls back to its position, as before.
  const { gradient, text } = barStyle(band.color || fallbackColor(band.colorIndex));

  return (
    <section
      className="band"
      style={{ '--band-gradient': gradient, '--band-text': text } as CSSProperties}
    >
      {/* Header first, then the callouts that sit above the bars: a callout rendered
          before its own heading reads as belonging to the band above it. */}
      <h2 className="band-title">
        <CategoryIcon name={band.icon} className="band-icon" />
        {band.title}
        <button
          type="button"
          className="band-edit"
          title={`Edit the description of ${band.title}`}
          aria-label={`Edit the description of ${band.title}`}
          onClick={() => onEditDescription(band.categoryId)}
        >
          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="band-add"
          title={`Add an episode to ${band.title}`}
          aria-label={`Add an episode to ${band.title}`}
          onClick={() => onAdd(band.categoryId)}
        >
          +
        </button>
      </h2>

      {/* Sits between the heading and the callouts so it reads as part of the heading
          block rather than as a note attached to the first episode above the bars. */}
      {band.description && <p className="band-description">{band.description}</p>}

      {band.incidentRailsAbove.map((rail, index, rails) => (
        <RailRow
          key={rail.key}
          rail={rail}
          timelineId={timelineId}
          connect="down"
          // The topmost rail is furthest from the bars and has the most rails to cross.
          calloutRailsToCross={rails.length - 1 - index}
          eraRailCount={band.eraRails.length}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}

      {band.eraRails.map(rail => (
        <RailRow
          key={rail.key}
          rail={rail}
          timelineId={timelineId}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}

      {band.incidentRailsBelow.map((rail, index) => (
        <RailRow
          key={rail.key}
          rail={rail}
          timelineId={timelineId}
          connect="up"
          calloutRailsToCross={index}
          eraRailCount={band.eraRails.length}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
