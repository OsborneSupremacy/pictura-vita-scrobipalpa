import { describe, expect, it } from 'vitest';
import { toDayNumber } from '../layout';
import { describeAge, describeGap, gapLabel } from './elapsed';

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

describe('describeAge', () => {
  const living = { birth: day('1982-04-17'), death: null };
  const died = { birth: day('1982-04-17'), death: day('2020-09-30') };

  it('reads as an age in the same units as a gap', () => {
    expect(describeAge(living, day('2026-04-17'))).toBe('44 years');
    expect(describeAge(living, day('1995-12-01'))).toBe('13 years, 7 months');
  });

  it('keeps infancy in months and days rather than rounding to nothing', () => {
    expect(describeAge(living, day('1982-07-01'))).toBe('2 months, 14 days');
    expect(describeAge(living, day('1982-04-18'))).toBe('1 day');
  });

  it('gives the day of birth an age of zero, not "today"', () => {
    expect(describeAge(living, living.birth)).toBe('0 days');
  });

  it('has nothing to say about a day before the birth', () => {
    expect(describeAge(living, day('1975-06-01'))).toBeNull();
  });

  it('has nothing to say about a day after the death', () => {
    expect(describeAge(died, day('2020-10-01'))).toBeNull();
    expect(describeAge(died, day('2024-01-01'))).toBeNull();
  });

  it('still gives an age on the day of death itself', () => {
    expect(describeAge(died, died.death)).toBe('38 years, 5 months');
  });

  it('does not bound a living subject at the far end', () => {
    expect(describeAge(living, day('2060-04-17'))).toBe('78 years');
  });
});
