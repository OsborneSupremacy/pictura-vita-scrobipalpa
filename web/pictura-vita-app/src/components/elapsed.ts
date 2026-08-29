import { calendarDiff, type DayNumber } from '../layout';

function plural(n: number, unit: string): string {
  return n === 1 ? unit : `${unit}s`;
}

/**
 * How far apart two dates are, in the largest two units that carry information: a span of
 * years does not need its day count, but something from last week is only useful in days.
 * Direction is carried by the label (see `gapLabel`), not by the text.
 */
export function describeGap(from: DayNumber, to: DayNumber): string {
  const { years, months, days } = calendarDiff(from, to);

  if (years > 0) {
    return months > 0
      ? `${years} ${plural(years, 'year')}, ${months} ${plural(months, 'month')}`
      : `${years} ${plural(years, 'year')}`;
  }

  if (months > 0) {
    return days > 0
      ? `${months} ${plural(months, 'month')}, ${days} ${plural(days, 'day')}`
      : `${months} ${plural(months, 'month')}`;
  }

  if (days > 0) return `${days} ${plural(days, 'day')}`;
  return 'today';
}

/**
 * "Time since" for a date already past, "Time until" for one still to come, so the value
 * itself never has to carry an "ago" that would contradict a fixed label.
 */
export function gapLabel(suffix: string, from: DayNumber, to: DayNumber): string {
  const prefix = to < from ? 'Time until' : 'Time since';
  return suffix ? `${prefix} ${suffix}` : prefix;
}
