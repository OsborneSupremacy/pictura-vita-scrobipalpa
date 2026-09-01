import { wholeYearsBetween, type DayNumber } from './dates';

/**
 * The longest span a timeline may cover, in whole years.
 *
 * Not a performance limit: the layout is effectively span-independent, and a 5,000-year
 * window over 200 episodes builds in about a millisecond. It is a legibility limit. The
 * window is always fitted to the surface's width — there is no horizontal scroll — so span
 * and pixels-per-year trade off directly, and past a point the drawing stops carrying
 * information. At 1,000 years on a 1400px surface a year is 1.4px, which still leaves the
 * coarsest axis grain a readable 70px per increment and keeps every episode reachable
 * through its callout. It is generous enough for an institution founded in the middle ages
 * and short of the point where a year is thinner than a pixel.
 */
export const MAX_SPAN_YEARS = 1000;

/**
 * Above this the drawing is still usable but no longer direct: era bars fall below the
 * width that holds a label, so most episodes are read from their callouts instead of from
 * their position on the band. Worth saying out loud, not worth refusing.
 */
export const CROWDED_SPAN_YEARS = 250;

/** Whole years covered by `[floor, ceiling]`. */
export function spanYears(floor: DayNumber, ceiling: DayNumber): number {
  return wholeYearsBetween(floor, ceiling);
}

/**
 * Why the span cannot be drawn, or null.
 *
 * Enforced when a window is chosen rather than when one is read: a data file written
 * before this limit existed still opens, and `chooseGrain` keeps a century grain in hand
 * for exactly that case.
 */
export function spanProblem(floor: DayNumber, ceiling: DayNumber): string | null {
  const years = spanYears(floor, ceiling);
  if (years <= MAX_SPAN_YEARS) return null;

  return (
    `A timeline can cover at most ${MAX_SPAN_YEARS.toLocaleString()} years; ` +
    `this one covers ${years.toLocaleString()}. Bring the dates closer together.`
  );
}

/** What is worth knowing about a span that is legal but hard to read, or null. */
export function spanNotice(floor: DayNumber, ceiling: DayNumber): string | null {
  const years = spanYears(floor, ceiling);
  if (years <= CROWDED_SPAN_YEARS || years > MAX_SPAN_YEARS) return null;

  return (
    `This timeline covers ${years.toLocaleString()} years. Past about ` +
    `${CROWDED_SPAN_YEARS} there is not enough width for an episode to be read from its ` +
    `bar, so most are drawn as callouts instead. Click an axis increment to zoom in.`
  );
}
