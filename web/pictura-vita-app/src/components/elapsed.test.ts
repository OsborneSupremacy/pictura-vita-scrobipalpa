import { describe, expect, it } from 'vitest';
import { toDayNumber } from '../layout';
import { describeGap, gapLabel } from './elapsed';

const day = toDayNumber;
const today = day('2026-08-29');

describe('describeGap', () => {
  it('drops the months when a span lands on whole years', () => {
    expect(describeGap(day('1989-08-29'), today)).toBe('37 years');
  });

  it('adds months to a span of years, but not the leftover days', () => {
    expect(describeGap(day('2002-05-01'), today)).toBe('24 years, 3 months');
  });

  it('falls back to months and days under a year', () => {
    expect(describeGap(day('2026-05-29'), today)).toBe('3 months');
    expect(describeGap(day('2026-05-01'), today)).toBe('3 months, 28 days');
  });

  it('uses days alone under a month', () => {
    expect(describeGap(day('2026-08-27'), today)).toBe('2 days');
    expect(describeGap(day('2026-08-28'), today)).toBe('1 day');
  });

  it('says today for the same day', () => {
    expect(describeGap(today, today)).toBe('today');
  });

  it('singularises a lone unit', () => {
    expect(describeGap(day('2025-08-29'), today)).toBe('1 year');
    expect(describeGap(day('2026-07-29'), today)).toBe('1 month');
  });

  it('describes a future gap with the same words', () => {
    // Direction lives in the label, so the text reads the same either way.
    expect(describeGap(day('2028-08-29'), today)).toBe('2 years');
  });
});

describe('gapLabel', () => {
  it('says "since" for a date already past', () => {
    expect(gapLabel('start', day('2002-05-01'), today)).toBe('Time since start');
  });

  it('says "until" for a date still to come', () => {
    expect(gapLabel('end', day('2030-01-01'), today)).toBe('Time until end');
  });

  it('omits the suffix when there is nothing to qualify', () => {
    expect(gapLabel('', day('1989-08-05'), today)).toBe('Time since');
  });

  it('treats the same day as not yet future', () => {
    expect(gapLabel('start', today, today)).toBe('Time since start');
  });
});
