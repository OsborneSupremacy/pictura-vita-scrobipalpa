import { describe, expect, it } from 'vitest';
import { toDayNumber } from '../layout';
import { buildExportPayload, exportFileName, serializeExport } from './export';
import type { ApiTimeline } from './types';

const timeline = (id: string) =>
  ({ timelineId: id, timelineInfo: {}, episodes: [], categories: [] }) as unknown as ApiTimeline;

describe('exportFileName', () => {
  it('carries the date, in an order that sorts', () => {
    expect(exportFileName(toDayNumber('2026-08-29'))).toBe('pictura-vita-2026-08-29.json');
  });

  it('zero-pads single-digit months and days', () => {
    expect(exportFileName(toDayNumber('2027-01-05'))).toBe('pictura-vita-2027-01-05.json');
  });

  it('gives a different name on a different day, so backups do not collide', () => {
    expect(exportFileName(toDayNumber('2026-08-29')))
      .not.toBe(exportFileName(toDayNumber('2026-08-30')));
  });
});

describe('buildExportPayload', () => {
  it('gathers the timelines into one array the migration tool can read back', () => {
    const payload = buildExportPayload([timeline('a'), timeline('b')]);
    expect(Object.keys(payload)).toEqual(['timelines']);
    expect(payload.timelines.map(t => t.timelineId)).toEqual(['a', 'b']);
  });

  it('exports every timeline, not just the one on screen', () => {
    expect(buildExportPayload([timeline('a'), timeline('b'), timeline('c')]).timelines).toHaveLength(3);
  });

  it('produces a usable file even with no timelines', () => {
    expect(buildExportPayload([])).toEqual({ timelines: [] });
  });
});

describe('serializeExport', () => {
  it('round-trips back to the same payload', () => {
    const payload = buildExportPayload([timeline('a')]);
    expect(JSON.parse(serializeExport(payload))).toEqual(payload);
  });

  it('is indented and newline-terminated, so backups diff cleanly', () => {
    const text = serializeExport(buildExportPayload([timeline('a')]));
    expect(text.startsWith('{\n  "timelines"')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });
});
