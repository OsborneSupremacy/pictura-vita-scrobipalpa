import type { ApiTimeline } from './types';
import { toIso, type DayNumber } from '../layout';

/**
 * Exporting the data.
 *
 * The point is portability: whatever else happens to this application, the data belongs to
 * whoever entered it and must be retrievable in a form that is useful without it. The
 * export is therefore byte-compatible with the store's own file, so a backup can simply be
 * put back by pointing `DATA_FILE_PATH` at it.
 */

/** The shape of the JSON data file: a single `timeline` collection. */
export interface ExportPayload {
  timeline: ApiTimeline[];
}

export function buildExportPayload(timelines: ApiTimeline[]): ExportPayload {
  return { timeline: timelines };
}

/** Serialized the way the store writes it, so a backup diffs cleanly against the original. */
export function serializeExport(payload: ExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Dated so successive backups sort chronologically and never overwrite one another.
 * ISO order rather than a local format, for the same reason.
 */
export function exportFileName(today: DayNumber): string {
  return `pictura-vita-${toIso(today)}.json`;
}
