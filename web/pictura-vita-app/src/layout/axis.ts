import {
  addMonths,
  addYears,
  clamp,
  daySpan,
  fromCivil,
  startOfMonth,
  startOfYear,
  toCivil,
  wholeYearsBetween,
  type DayNumber
} from './dates';
import type { AxisGrain, AxisIncrement } from './types';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** The grains that step in whole years and snap to a round multiple of them. */
type MultiYearGrain = 'fiveYears' | 'tenYears' | 'fiftyYears' | 'hundredYears';

const STEP_YEARS: Record<MultiYearGrain, number> = {
  fiveYears: 5,
  tenYears: 10,
  fiftyYears: 50,
  hundredYears: 100
};

/**
 * Chooses the axis grain from the span of the window.
 *
 * The first four thresholds are the original's: up to 1 year -> months, up to 10 -> years,
 * up to 80 -> five years, beyond -> decades. The last two are new, because decades were
 * the original's coarsest grain and a span of several centuries shredded the axis into
 * increments too narrow to label — which also cost the user the axis as a zoom control,
 * since clicking an increment is how you drill in.
 *
 * The boundaries keep an increment wide enough to hold its label: an increment gets
 * `stepYears * width / span` pixels, and a label like "1500-49" needs about 54 of them at
 * the 12px the stylesheet sets. Held against a deliberately narrow 1200px surface, that
 * puts the changeover at roughly 20 years of span per year of step.
 */
export function chooseGrain(floor: DayNumber, ceiling: DayNumber): AxisGrain {
  const years = wholeYearsBetween(floor, ceiling);
  if (years <= 1) return 'month';
  if (years <= 10) return 'year';
  if (years <= 80) return 'fiveYears';
  if (years <= 200) return 'tenYears';
  if (years <= 1000) return 'fiftyYears';
  return 'hundredYears';
}

/**
 * Snaps backwards to the natural boundary the grain starts on, so increments land on
 * round numbers (the 1st of a month, Jan 1, a year divisible by 5, 10, 50 or 100) rather
 * than on an arbitrary offset from the window's start.
 */
export function snapBack(dayNumber: DayNumber, grain: AxisGrain): DayNumber {
  switch (grain) {
    case 'month':
      return startOfMonth(dayNumber);
    case 'year':
      return startOfYear(dayNumber);
    case 'fiveYears':
    case 'tenYears':
    case 'fiftyYears':
    case 'hundredYears': {
      const step = STEP_YEARS[grain];
      const { year } = toCivil(dayNumber);
      // Math.floor rather than % so that negative years snap backwards too.
      return fromCivil({ year: Math.floor(year / step) * step, month: 1, day: 1 });
    }
  }
}

function advance(dayNumber: DayNumber, grain: AxisGrain): DayNumber {
  switch (grain) {
    case 'month':
      return addMonths(dayNumber, 1);
    case 'year':
      return addYears(dayNumber, 1);
    case 'fiveYears':
    case 'tenYears':
    case 'fiftyYears':
    case 'hundredYears':
      return addYears(dayNumber, STEP_YEARS[grain]);
  }
}

function labelsFor(
  grain: AxisGrain,
  start: DayNumber,
  end: DayNumber
): { label: string; longLabel: string } {
  const from = toCivil(start);
  const to = toCivil(end);

  switch (grain) {
    case 'month':
      return {
        label: `${MONTHS_SHORT[from.month - 1]} ${String(from.year % 100).padStart(2, '0')}`,
        longLabel: `${MONTHS_LONG[from.month - 1]} ${from.year}`
      };
    case 'year':
      return { label: String(from.year), longLabel: String(from.year) };
    case 'hundredYears':
      // A century snaps to a round hundred, so the decade digits are always "00-99" and
      // spelling them out says nothing. "1500s" is both shorter and how centuries are read.
      return { label: `${from.year}s`, longLabel: `${from.year} - ${to.year}` };
    case 'fiveYears':
    case 'tenYears':
    case 'fiftyYears':
      return {
        label: `${from.year}-${String(to.year % 100).padStart(2, '0')}`,
        longLabel: `${from.year} - ${to.year}`
      };
  }
}

/**
 * Builds the axis increments spanning `[floor, ceiling]`.
 *
 * The first and last increments are partial whenever the window does not begin or end on a
 * boundary, and are narrower to match. Widths are proportional to the days each increment
 * actually covers within the window.
 */
export function buildAxis(
  floor: DayNumber,
  ceiling: DayNumber,
  totalWidth: number
): AxisIncrement[] {
  if (ceiling < floor || totalWidth <= 0) return [];

  const grain = chooseGrain(floor, ceiling);
  const totalDays = daySpan(floor, ceiling);
  const pxPerDay = totalWidth / totalDays;

  const increments: AxisIncrement[] = [];
  let cursor = snapBack(floor, grain);

  while (cursor <= ceiling) {
    const next = advance(cursor, grain);
    const rawEnd = next - 1;

    const start = clamp(cursor, floor, ceiling);
    const end = clamp(rawEnd, floor, ceiling);

    increments.push({
      key: `axis-${start}`,
      start,
      end,
      grain,
      ...labelsFor(grain, cursor, rawEnd),
      width: daySpan(start, end) * pxPerDay,
      onFloor: start <= floor,
      onCeiling: end >= ceiling,
      // Zooming into a month would leave nothing further to divide.
      zoomable: grain !== 'month'
    });

    cursor = next;
  }

  return increments;
}
