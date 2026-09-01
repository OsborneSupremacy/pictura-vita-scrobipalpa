import { describe, expect, it } from 'vitest';
import {
  CROWDED_SPAN_YEARS,
  MAX_SPAN_YEARS,
  spanNotice,
  spanProblem,
  spanYears
} from './span';
import { toDayNumber } from './dates';

const day = toDayNumber;

describe('spanYears', () => {
  it('counts whole years between the bounds', () => {
    expect(spanYears(day('1976-04-01'), day('2026-04-01'))).toBe(50);
    expect(spanYears(day('1976-04-01'), day('2026-03-31'))).toBe(49);
  });
});

describe('spanProblem', () => {
  it('allows a span at the limit', () => {
    expect(spanProblem(day('1026-01-01'), day('2026-01-01'))).toBeNull();
  });

  it('allows a human lifetime with room either side', () => {
    expect(spanProblem(day('1876-01-01'), day('2026-01-01'))).toBeNull();
  });

  it('rejects a span past the limit, naming both numbers', () => {
    const problem = spanProblem(day('1025-01-01'), day('2026-01-01'));
    expect(problem).toContain('1,000');
    expect(problem).toContain('1,001');
  });
});

describe('spanNotice', () => {
  it('says nothing about a span that draws directly', () => {
    expect(spanNotice(day('1876-01-01'), day('2026-01-01'))).toBeNull();
  });

  it('says nothing at the crowding threshold itself', () => {
    expect(spanNotice(day('1776-01-01'), day('2026-01-01'))).toBeNull();
  });

  it('warns once past it', () => {
    expect(spanNotice(day('1775-01-01'), day('2026-01-01'))).toContain('251 years');
  });

  it('defers to the problem past the hard limit, so only one message shows', () => {
    expect(spanNotice(day('1025-01-01'), day('2026-01-01'))).toBeNull();
  });
});

describe('the two thresholds', () => {
  it('leave room between them for a span that is legal but worth flagging', () => {
    expect(CROWDED_SPAN_YEARS).toBeLessThan(MAX_SPAN_YEARS);
  });
});
