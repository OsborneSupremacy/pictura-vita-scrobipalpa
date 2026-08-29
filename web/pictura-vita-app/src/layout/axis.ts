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

/**
 * Chooses the axis grain from the span of the window, matching the original:
 * up to 1 year -> months, up to 10 -> years, up to 80 -> five years, beyond -> decades.
 */
export function chooseGrain(floor: DayNumber, ceiling: DayNumber): AxisGrain {
  const years = wholeYearsBetween(floor, ceiling);
  if (years <= 1) return 'month';
  if (years <= 10) return 'year';
  if (years <= 80) return 'fiveYears';
  return 'tenYears';
}

/**
 * Snaps backwards to the natural boundary the grain starts on, so increments land on
 * round numbers (the 1st of a month, Jan 1, a year divisible by 5 or 10) rather than on
 * an arbitrary offset from the window's start.
 */
export function snapBack(dayNumber: DayNumber, grain: AxisGrain): DayNumber {
  switch (grain) {
    case 'month':
      return startOfMonth(dayNumber);
    case 'year':
      return startOfYear(dayNumber);
    case 'fiveYears':
    case 'tenYears': {
      const step = grain === 'fiveYears' ? 5 : 10;
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
      return addYears(dayNumber, 5);
    case 'tenYears':
      return addYears(dayNumber, 10);
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
    case 'fiveYears':
    case 'tenYears':
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
