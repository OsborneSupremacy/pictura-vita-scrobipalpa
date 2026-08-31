import { useEffect, useRef, useState } from 'react';
import { daySpan, toIso, type Window } from '../layout';
import { toZoomDraft, toZoomWindow, zoomProblem, type ZoomDraft } from './zoomRange';

interface Props {
  /** The whole timeline: the furthest a custom range is allowed to reach. */
  bounds: Window;
  /** What is on screen now, which the fields open on. */
  current: Window;
  onApply: (window: Window) => void;
  onClose: () => void;
}

/**
 * Zooming to a range typed by hand, rather than to an axis increment or an episode.
 *
 * The bounds are the timeline's own start and end: outside them nothing is drawn, so a
 * wider range would only add empty space. Dates are whole days throughout — the domain
 * stores `DateOnly`, so there is no time of day to offer.
 */
export function ZoomDialog({ bounds, current, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ZoomDraft>(() => toZoomDraft(current));

  // showModal rather than the open attribute, as the other dialogs do: it brings the focus
  // trap, the backdrop and Escape-to-close with it.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const min = toIso(bounds.floor);
  const max = toIso(bounds.ceiling);

  const set = <K extends keyof ZoomDraft>(key: K, value: ZoomDraft[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));

  // The fields open on the current window, which is always valid, so a problem is only
  // ever the consequence of an edit and can be shown as soon as it appears.
  const problem = zoomProblem(draft, bounds);
  const chosen = problem ? null : toZoomWindow(draft, bounds);
  const days = chosen ? daySpan(chosen.floor, chosen.ceiling) : null;

  const apply = () => {
    if (chosen) onApply(chosen);
  };

  return (
    <dialog ref={dialog} className="info-dialog zoom-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>Zoom to dates</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fields">
          <label>
            From
            <input
              type="date"
              value={draft.start}
              min={min}
              max={max}
              onChange={e => set('start', e.target.value)}
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={draft.end}
              min={min}
              max={max}
              onChange={e => set('end', e.target.value)}
            />
          </label>

          {/* The limits are worth stating outright: the date inputs enforce them, but a
              greyed-out day in a picker does not explain itself. */}
          <p className="muted zoom-bounds">
            Anywhere within the timeline: {min} – {max}
            <button type="button" className="link" onClick={() => setDraft(toZoomDraft(bounds))}>
              Whole timeline
            </button>
          </p>
        </div>

        {problem && <p className="bad">{problem}</p>}

        <footer>
          {days !== null && (
            <span className="muted zoom-span">
              {days.toLocaleString()} {days === 1 ? 'day' : 'days'}
            </span>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={apply}
            disabled={problem !== null}
            title={problem ?? undefined}
          >
            Zoom
          </button>
        </footer>
      </form>
    </dialog>
  );
}
