import { describe, expect, it } from 'vitest';
import { buildAxis, chooseGrain, snapBack } from './axis';
import { toDayNumber, toIso } from './dates';

const day = toDayNumber;

describe('chooseGrain', () => {
  it.each([
    ['2024-01-01', '2024-06-01', 'month'],
    ['2024-01-01', '2025-01-01', 'month'],
    ['2020-01-01', '2025-01-01', 'year'],
    ['2020-01-01', '2030-01-01', 'year'],
    ['1980-01-01', '2030-01-01', 'fiveYears'],
    ['1950-01-01', '2030-01-01', 'fiveYears'],
    ['1900-01-01', '2030-01-01', 'tenYears']
  ])('%s to %s uses %s increments', (floor, ceiling, expected) => {
    expect(chooseGrain(day(floor), day(ceiling))).toBe(expected);
  });
});

describe('snapBack', () => {
  it('snaps to the start of the containing period', () => {
    expect(toIso(snapBack(day('2024-06-17'), 'month'))).toBe('2024-06-01');
    expect(toIso(snapBack(day('2024-06-17'), 'year'))).toBe('2024-01-01');
    expect(toIso(snapBack(day('1987-06-17'), 'fiveYears'))).toBe('1985-01-01');
    expect(toIso(snapBack(day('1987-06-17'), 'tenYears'))).toBe('1980-01-01');
  });

  it('is a no-op on a date already on a boundary', () => {
    expect(toIso(snapBack(day('1985-01-01'), 'fiveYears'))).toBe('1985-01-01');
  });
});

describe('buildAxis', () => {
  const floor = day('1985-03-15');
  const ceiling = day('1990-09-20');

  it('covers the window exactly, with no gaps or overhang', () => {
    const axis = buildAxis(floor, ceiling, 1000);

    expect(axis[0]!.start).toBe(floor);
    expect(axis.at(-1)!.end).toBe(ceiling);

    for (let i = 1; i < axis.length; i += 1) {
      expect(axis[i]!.start).toBe(axis[i - 1]!.end + 1);
    }
  });

  it('widths sum to the full width', () => {
    const axis = buildAxis(floor, ceiling, 1000);
    const total = axis.reduce((sum, increment) => sum + increment.width, 0);
    expect(total).toBeCloseTo(1000, 6);
  });

  it('flags the first and last increments as touching the bounds', () => {
    const axis = buildAxis(floor, ceiling, 1000);
    expect(axis[0]!.onFloor).toBe(true);
    expect(axis[0]!.onCeiling).toBe(false);
    expect(axis.at(-1)!.onCeiling).toBe(true);
  });

  it('makes the partial first increment narrower than a whole one', () => {
    const axis = buildAxis(floor, ceiling, 1000);
    // The window starts mid-March 1985, so that year is clipped.
    expect(axis[0]!.width).toBeLessThan(axis[1]!.width);
  });

  it('labels year increments with the year', () => {
    const axis = buildAxis(day('1985-01-01'), day('1990-01-01'), 1000);
    expect(axis.map(a => a.label).slice(0, 3)).toEqual(['1985', '1986', '1987']);
  });

  it('labels multi-year increments as a range', () => {
    const axis = buildAxis(day('1950-01-01'), day('2020-01-01'), 1000);
    expect(axis[0]!.label).toBe('1950-54');
    expect(axis[0]!.longLabel).toBe('1950 - 1954');
  });

  it('labels month increments with an abbreviated month and year', () => {
    const axis = buildAxis(day('2024-01-01'), day('2024-05-31'), 1000);
    expect(axis.map(a => a.label)).toEqual(['Jan 24', 'Feb 24', 'Mar 24', 'Apr 24', 'May 24']);
  });

  it('does not offer zoom at the finest grain', () => {
    expect(buildAxis(day('2024-01-01'), day('2024-05-31'), 1000).every(a => !a.zoomable)).toBe(true);
    expect(buildAxis(day('1950-01-01'), day('2020-01-01'), 1000).every(a => a.zoomable)).toBe(true);
  });

  it('returns nothing for a zero width or an inverted window', () => {
    expect(buildAxis(floor, ceiling, 0)).toEqual([]);
    expect(buildAxis(ceiling, floor, 1000)).toEqual([]);
  });
});
