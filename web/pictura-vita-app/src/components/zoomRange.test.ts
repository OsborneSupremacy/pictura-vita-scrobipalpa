import { describe, expect, it } from 'vitest';
import { toZoomDraft, toZoomWindow, zoomProblem } from './zoomRange';
import { toDayNumber, toIso } from '../layout';

const bounds = { floor: toDayNumber('1980-01-01'), ceiling: toDayNumber('2020-12-31') };

describe('toZoomDraft', () => {
  it('starts from the window it is given', () => {
    expect(toZoomDraft(bounds)).toEqual({ start: '1980-01-01', end: '2020-12-31' });
  });
});

describe('zoomProblem', () => {
  it('accepts a range inside the bounds', () => {
    expect(zoomProblem({ start: '1999-01-01', end: '2000-06-30' }, bounds)).toBeNull();
  });

  it('accepts the bounds themselves', () => {
    expect(zoomProblem(toZoomDraft(bounds), bounds)).toBeNull();
  });

  it('accepts a single day', () => {
    expect(zoomProblem({ start: '1999-01-01', end: '1999-01-01' }, bounds)).toBeNull();
  });

  it('asks for a missing date rather than reporting it as out of range', () => {
    expect(zoomProblem({ start: '', end: '2000-01-01' }, bounds)).toMatch(/start from/);
    expect(zoomProblem({ start: '2000-01-01', end: '' }, bounds)).toMatch(/end at/);
  });

  it('treats a half-typed date as missing', () => {
    expect(zoomProblem({ start: '199', end: '2000-01-01' }, bounds)).toMatch(/start from/);
  });

  it('rejects an inverted range', () => {
    expect(zoomProblem({ start: '2000-01-02', end: '2000-01-01' }, bounds)).toMatch(/before/);
  });

  it('rejects dates outside the timeline', () => {
    expect(zoomProblem({ start: '1979-12-31', end: '2000-01-01' }, bounds)).toMatch(/start date/);
    expect(zoomProblem({ start: '2000-01-01', end: '2021-01-01' }, bounds)).toMatch(/end date/);
  });

  it('names the bounds it is enforcing', () => {
    expect(zoomProblem({ start: '1979-12-31', end: '2000-01-01' }, bounds)).toContain(
      '1980-01-01 – 2020-12-31'
    );
  });
});

describe('toZoomWindow', () => {
  it('parses the draft', () => {
    const window = toZoomWindow({ start: '1999-01-01', end: '2000-06-30' }, bounds);
    expect([toIso(window.floor), toIso(window.ceiling)]).toEqual(['1999-01-01', '2000-06-30']);
  });

  it('clamps a value that got past the input min and max', () => {
    const window = toZoomWindow({ start: '1900-01-01', end: '2999-01-01' }, bounds);
    expect(window).toEqual(bounds);
  });

  it('never returns an inverted window', () => {
    const window = toZoomWindow({ start: '2000-01-02', end: '2000-01-01' }, bounds);
    expect(window.ceiling).toBe(window.floor);
  });
});
