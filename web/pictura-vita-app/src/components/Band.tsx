import type { CSSProperties } from 'react';
import type { CategoryBand, Rail, TimeItem } from '../layout';
import { CategoryIcon } from '../icons/CategoryIcon';

interface Props {
  band: CategoryBand;
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
  onAdd: (categoryId: string) => void;
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
  selected,
  onSelect
}: {
  item: TimeItem;
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
  connect,
  calloutRailsToCross = 0,
  eraRailCount = 1,
  selectedKey,
  onSelect
}: {
  rail: Rail;
  connect?: 'up' | 'down';
  calloutRailsToCross?: number;
  eraRailCount?: number;
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
}) {
  return (
    <div className={`rail rail-${rail.kind}`}>
      {rail.items.map(item => (
        <div key={item.key} className="rail-cell" style={{ width: `${item.width}px` }}>
          <ItemBox item={item} selected={item.key === selectedKey} onSelect={onSelect} />
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

export function Band({ band, selectedKey, onSelect, onAdd }: Props) {
  return (
    <section className={`band cat-${band.colorIndex}`}>
      {/* Header first, then the callouts that sit above the bars: a callout rendered
          before its own heading reads as belonging to the band above it. */}
      <h2 className="band-title">
        <CategoryIcon name={band.icon} className="band-icon" />
        {band.title}
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

      {band.incidentRailsAbove.map((rail, index, rails) => (
        <RailRow
          key={rail.key}
          rail={rail}
          connect="down"
          // The topmost rail is furthest from the bars and has the most rails to cross.
          calloutRailsToCross={rails.length - 1 - index}
          eraRailCount={band.eraRails.length}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}

      {band.eraRails.map(rail => (
        <RailRow key={rail.key} rail={rail} selectedKey={selectedKey} onSelect={onSelect} />
      ))}

      {band.incidentRailsBelow.map((rail, index) => (
        <RailRow
          key={rail.key}
          rail={rail}
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
