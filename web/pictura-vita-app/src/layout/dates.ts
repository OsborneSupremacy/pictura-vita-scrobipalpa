/**
 * Whole-day date arithmetic.
 *
 * The domain stores dates as `DateOnly` (`yyyy-MM-dd`), so the layout works in *day numbers* —
 * integer days since 1970-01-01 — rather than milliseconds. That keeps every width calculation
 * exact and sidesteps time zones and DST entirely, which the original AngularJS implementation
 * did not: it subtracted `moment` millisecond values and inherited the browser's zone.
 */

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01. Negative for earlier dates. */
export type DayNumber = number;

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** The `DateOnly.MaxValue` the API uses to mean "no known end". */
export const MAX_DATE_ISO = '9999-12-31';

/** The `DateOnly.MinValue` the API uses to mean "no date given", as an unknown birth is. */
export const MIN_DATE_ISO = '0001-01-01';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fromCivil({ year, month, day }: CivilDate): DayNumber {
  // Built via setUTCFullYear rather than Date.UTC so that years below 100 are not
  // silently shifted into the 1900s.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return Math.round(date.getTime() / MS_PER_DAY);
}

export function toCivil(dayNumber: DayNumber): CivilDate {
  const date = new Date(dayNumber * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

/** Parses a `yyyy-MM-dd` date. Throws on anything else rather than guessing. */
export function toDayNumber(iso: string): DayNumber {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Expected a yyyy-MM-dd date, received "${iso}"`);
  return fromCivil({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  });
}

export function toIso(dayNumber: DayNumber): string {
  const { year, month, day } = toCivil(dayNumber);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The number of days covered by `[start, end]`, counted **inclusively**: a single-day span
 * is 1 day. This matches `EpisodeExtensions.Duration` on the server and the original app's
 * `dayEndVal(end) - dayStartVal(start)`, which likewise spanned through the end of the final day.
 * An inverted range yields 0.
 */
export function daySpan(start: DayNumber, end: DayNumber): number {
  return Math.max(0, end - start + 1);
}

export function addDays(dayNumber: DayNumber, days: number): DayNumber {
  return dayNumber + days;
}

export function addMonths(dayNumber: DayNumber, months: number): DayNumber {
  const { year, month, day } = toCivil(dayNumber);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = zeroBased - targetYear * 12 + 1;
  return fromCivil({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth))
  });
}

export function addYears(dayNumber: DayNumber, years: number): DayNumber {
  return addMonths(dayNumber, years * 12);
}

export function daysInMonth(year: number, month: number): number {
  return toCivil(fromCivil({ year, month: month + 1, day: 1 }) - 1).day;
}

export function startOfMonth(dayNumber: DayNumber): DayNumber {
  const { year, month } = toCivil(dayNumber);
  return fromCivil({ year, month, day: 1 });
}

export function startOfYear(dayNumber: DayNumber): DayNumber {
  return fromCivil({ year: toCivil(dayNumber).year, month: 1, day: 1 });
}

/** Whole years from `start` to `end`, i.e. how many anniversaries of `start` have passed. */
export function wholeYearsBetween(start: DayNumber, end: DayNumber): number {
  const from = toCivil(start);
  const to = toCivil(end);
  let years = to.year - from.year;
  if (to.month < from.month || (to.month === from.month && to.day < from.day)) years -= 1;
  return years;
}

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
  /** True when `to` falls before `from`, i.e. the span runs into the future. */
  future: boolean;
}

/**
 * The gap between two dates broken into calendar years, months and leftover days.
 *
 * Calendar-aware rather than a division of the day count, so "one year" means the same
 * date a year later regardless of leap years, and month lengths are respected. The
 * magnitude is always non-negative; `future` carries the direction.
 */
export function calendarDiff(from: DayNumber, to: DayNumber): CalendarDiff {
  const future = to < from;
  const earlier = toCivil(future ? to : from);
  const later = toCivil(future ? from : to);

  let years = later.year - earlier.year;
  let months = later.month - earlier.month;

  // A day-of-month that has not come round yet means the final month is incomplete.
  if (later.day < earlier.day) months -= 1;

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  // Rather than borrowing a month's length — which can still leave a negative remainder,
  // e.g. 31 Jan to 1 Mar, where February is shorter than the shortfall — advance the
  // earlier date by the whole months counted and measure what is left. addMonths already
  // clamps a day that the target month does not have.
  const from_ = future ? to : from;
  const to_ = future ? from : to;
  const days = to_ - addMonths(from_, years * 12 + months);

  return { years, months, days, future };
}

export function clamp(value: DayNumber, min: DayNumber, max: DayNumber): DayNumber {
  return Math.min(Math.max(value, min), max);
}
