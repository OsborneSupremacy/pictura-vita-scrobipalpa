import { useEffect, useRef, useState } from 'react';
import { barStyle } from '../color/contrast';
import { PALETTE } from '../color/palette';

interface Props {
  value: string;
  disabled?: boolean;
  /** Shown as the swatch when nothing is chosen. */
  fallback: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, disabled = false, fallback, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const shown = value || fallback;

  return (
    <div className="color-picker" ref={root}>
      <button
        type="button"
        className="color-trigger"
        disabled={disabled}
        title={value ? value : `Automatic (${fallback})`}
        aria-label={value ? `Colour ${value}` : 'Colour: automatic'}
        style={{ background: barStyle(shown).gradient }}
        onClick={() => setOpen(current => !current)}
      >
        {!value && <span className="color-auto">A</span>}
      </button>

      {open && (
        <div className="color-panel">
          <div className="swatches">
            {PALETTE.map(color => (
              <button
                key={color}
                type="button"
                className={color === value ? 'chosen' : ''}
                title={color}
                style={{ background: barStyle(color).gradient }}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              />
            ))}
          </div>

          <label className="custom">
            Custom
            <input
              type="color"
              value={shown}
              onChange={event => onChange(event.target.value)}
            />
          </label>

          {/* Automatic keeps the old behaviour: colour follows the band's position. */}
          <button type="button" className="link" onClick={() => { onChange(''); setOpen(false); }}>
            Use automatic colour
          </button>
        </div>
      )}
    </div>
  );
}
