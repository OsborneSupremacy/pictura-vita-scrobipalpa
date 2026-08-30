import { useEffect, useRef, useState } from 'react';
import { CATEGORY_ICONS, ICON_NAMES } from '../icons/registry';
import { CategoryIcon } from '../icons/CategoryIcon';

interface Props {
  value: string;
  disabled?: boolean;
  onChange: (icon: string) => void;
}

/** Turns "graduation-cap" into "graduation cap" for searching and for the tooltip. */
const readable = (name: string) => name.replace(/-/g, ' ');

/**
 * Each icon is an inline SVG, so drawing the whole set at once builds well over a thousand
 * nodes in one go and makes opening the picker visibly slow. Showing a first page and
 * letting search reach the rest keeps it instant, and search is the natural way to find
 * something among hundreds anyway.
 */
const VISIBLE_LIMIT = 96;

export function IconPicker({ value, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const matches = query
    ? ICON_NAMES.filter(name => readable(name).includes(query.toLowerCase().trim()))
    : ICON_NAMES;

  const shown = matches.slice(0, VISIBLE_LIMIT);
  const hidden = matches.length - shown.length;

  /** Closing always clears the search, so the picker never reopens still filtered. */
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (icon: string) => {
    onChange(icon);
    close();
  };

  return (
    <div className="icon-picker" ref={root}>
      <button
        type="button"
        className="icon-trigger"
        disabled={disabled}
        title={value ? readable(value) : 'Choose an icon'}
        aria-label={value ? `Icon: ${readable(value)}` : 'Choose an icon'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {value && CATEGORY_ICONS[value] ? (
          <CategoryIcon name={value} size={16} />
        ) : (
          <span className="icon-empty">—</span>
        )}
      </button>

      {open && (
        <div className="icon-panel">
          <input
            autoFocus
            value={query}
            placeholder="Search icons"
            onChange={event => setQuery(event.target.value)}
          />

          <div className="icon-grid">
            {/* An explicit way back to no icon; clearing a choice should not need a reset. */}
            <button
              type="button"
              className={value === '' ? 'chosen' : ''}
              title="No icon"
              onClick={() => choose('')}
            >
              —
            </button>

            {shown.map(name => (
              <button
                key={name}
                type="button"
                className={name === value ? 'chosen' : ''}
                title={readable(name)}
                onClick={() => choose(name)}
              >
                <CategoryIcon name={name} size={16} />
              </button>
            ))}
          </div>

          {matches.length === 0 && <p className="muted">No icon matches “{query}”.</p>}

          {hidden > 0 && (
            <p className="muted">
              {hidden} more — type to narrow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
