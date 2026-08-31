import { clamp, toDayNumber, toIso, type Window } from '../layout';

/** A custom zoom range as the two date inputs hold it: `yyyy-MM-dd`, or blank. */
export interface ZoomDraft {
  start: string;
  end: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toZoomDraft({ floor, ceiling }: Window): ZoomDraft {
  return { start: toIso(floor), end: toIso(ceiling) };
}

/**
 * What is wrong with the draft, in the same voice as the timeline info dialog: one problem
 * at a time, phrased as the thing to do about it.
 *
 * Dates are compared as strings rather than day numbers because a `yyyy-MM-dd` sorts
 * lexicographically, and a half-typed date must not reach `toDayNumber`, which throws.
 */
export function zoomProblem(draft: ZoomDraft, bounds: Window): string | null {
  const floor = toIso(bounds.floor);
  const ceiling = toIso(bounds.ceiling);

  if (!ISO_DATE.test(draft.start)) return 'Give a date to start from.';
  if (!ISO_DATE.test(draft.end)) return 'Give a date to end at.';
  if (draft.end < draft.start) return 'The end date is before the start date.';

  // The timeline's own bounds are the limit: there is nothing drawn outside them to zoom to.
  if (draft.start < floor || draft.start > ceiling) {
    return `The start date is outside the timeline (${floor} – ${ceiling}).`;
  }
  if (draft.end < floor || draft.end > ceiling) {
    return `The end date is outside the timeline (${floor} – ${ceiling}).`;
  }

  return null;
}

/**
 * The draft as a window, clamped to the bounds. Callers check `zoomProblem` first; the
 * clamp is a second line of defence, since a date input's min/max is advisory in some
 * browsers and a typed value can land outside it.
 */
export function toZoomWindow(draft: ZoomDraft, bounds: Window): Window {
  const floor = clamp(toDayNumber(draft.start), bounds.floor, bounds.ceiling);
  const ceiling = clamp(toDayNumber(draft.end), bounds.floor, bounds.ceiling);
  return { floor, ceiling: Math.max(floor, ceiling) };
}
