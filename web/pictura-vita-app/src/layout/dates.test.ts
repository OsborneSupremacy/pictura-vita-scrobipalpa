import { describe, expect, it } from 'vitest';
import {
  addMonths,
  addYears,
  daySpan,
  daysInMonth,
  startOfMonth,
  startOfYear,
  toDayNumber,
  toIso,
  wholeYearsBetween
} from './dates';

describe('toDayNumber / toIso', () => {
  it('round-trips dates', () => {
    for (const iso of ['1970-01-01', '1930-12-15', '2024-02-29', '1899-12-31', '9999-12-31']) {
      expect(toIso(toDayNumber(iso))).toBe(iso);
    }
  });

  it('anchors the epoch at zero', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('1970-01-02')).toBe(1);
    expect(toDayNumber('1969-12-31')).toBe(-1);
  });

  it('does not shift two-digit years into the 1900s', () => {
    expect(toIso(toDayNumber('0001-01-01'))).toBe('0001-01-01');
  });

  it('rejects anything that is not yyyy-MM-dd', () => {
    expect(() => toDayNumber('2024-1-1')).toThrow();
    expect(() => toDayNumber('not a date')).toThrow();
  });
});

describe('daySpan', () => {
  it('counts inclusively, matching the server-side Duration', () => {
    expect(daySpan(toDayNumber('2024-01-01'), toDayNumber('2024-01-01'))).toBe(1);
    expect(daySpan(toDayNumber('2024-01-01'), toDayNumber('2024-01-02'))).toBe(2);
    expect(daySpan(toDayNumber('2024-01-01'), toDayNumber('2024-12-31'))).toBe(366);
  });

  it('returns zero for an inverted range rather than a negative width', () => {
    expect(daySpan(toDayNumber('2024-01-10'), toDayNumber('2024-01-01'))).toBe(0);
  });
});

describe('calendar arithmetic', () => {
  it('clamps the day when a month is too short', () => {
    expect(toIso(addMonths(toDayNumber('2024-01-31'), 1))).toBe('2024-02-29');
    expect(toIso(addMonths(toDayNumber('2023-01-31'), 1))).toBe('2023-02-28');
  });

  it('walks backwards across a year boundary', () => {
    expect(toIso(addMonths(toDayNumber('2024-01-15'), -1))).toBe('2023-12-15');
    expect(toIso(addMonths(toDayNumber('2024-01-15'), -13))).toBe('2022-12-15');
  });

  it('handles leap day when adding years', () => {
    expect(toIso(addYears(toDayNumber('2024-02-29'), 1))).toBe('2025-02-28');
  });

  it('reports days in month', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('snaps to period starts', () => {
    expect(toIso(startOfMonth(toDayNumber('2024-06-17')))).toBe('2024-06-01');
    expect(toIso(startOfYear(toDayNumber('2024-06-17')))).toBe('2024-01-01');
  });
});

describe('wholeYearsBetween', () => {
  it('counts only completed years', () => {
    expect(wholeYearsBetween(toDayNumber('2000-06-15'), toDayNumber('2010-06-15'))).toBe(10);
    expect(wholeYearsBetween(toDayNumber('2000-06-15'), toDayNumber('2010-06-14'))).toBe(9);
    expect(wholeYearsBetween(toDayNumber('2000-06-15'), toDayNumber('2000-12-31'))).toBe(0);
  });
});
