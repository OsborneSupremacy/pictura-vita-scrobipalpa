import type { AxisIncrement } from '../layout';

interface Props {
  increments: AxisIncrement[];
  onZoom: (start: number, end: number) => void;
}

export function AxisRow({ increments, onZoom }: Props) {
  return (
    <div className="axis">
      {increments.map(increment => (
        <button
          key={increment.key}
          type="button"
          className="axis-increment"
          style={{ width: `${increment.width}px` }}
          title={
            increment.zoomable
              ? `${increment.longLabel} — click to zoom`
              : increment.longLabel
          }
          disabled={!increment.zoomable}
          onClick={() => onZoom(increment.start, increment.end)}
        >
          {increment.label}
        </button>
      ))}
    </div>
  );
}
