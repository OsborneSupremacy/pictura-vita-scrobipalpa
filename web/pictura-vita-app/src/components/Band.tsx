import type { CategoryBand, Rail, TimeItem } from '../layout';

interface Props {
  band: CategoryBand;
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
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

function Arrow({ item, direction }: { item: TimeItem; direction: 'up' | 'down' }) {
  const position = item.onFloor ? 'at-start' : item.onCeiling ? 'at-end' : 'centred';
  return <div className={`arrow arrow-${direction} ${position}`} />;
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
  arrow,
  selectedKey,
  onSelect
}: {
  rail: Rail;
  arrow?: 'up' | 'down';
  selectedKey: string | null;
  onSelect: (item: TimeItem, element: HTMLElement) => void;
}) {
  return (
    <div className={`rail rail-${rail.kind}`}>
      {rail.items.map(item => (
        <div key={item.key} className="rail-cell" style={{ width: `${item.width}px` }}>
          {arrow === 'up' && item.kind !== 'placeholder' && <Arrow item={item} direction="up" />}
          <ItemBox item={item} selected={item.key === selectedKey} onSelect={onSelect} />
          {arrow === 'down' && item.kind !== 'placeholder' && <Arrow item={item} direction="down" />}
        </div>
      ))}
    </div>
  );
}

export function Band({ band, selectedKey, onSelect }: Props) {
  return (
    <section className={`band cat-${band.colorIndex}`}>
      {/* Header first, then the callouts that sit above the bars: a callout rendered
          before its own heading reads as belonging to the band above it. */}
      <h2 className="band-title">{band.title}</h2>

      {band.incidentRailsAbove.map(rail => (
        <RailRow key={rail.key} rail={rail} arrow="down" selectedKey={selectedKey} onSelect={onSelect} />
      ))}

      {band.eraRails.map(rail => (
        <RailRow key={rail.key} rail={rail} selectedKey={selectedKey} onSelect={onSelect} />
      ))}

      {band.incidentRailsBelow.map(rail => (
        <RailRow key={rail.key} rail={rail} arrow="up" selectedKey={selectedKey} onSelect={onSelect} />
      ))}
    </section>
  );
}
