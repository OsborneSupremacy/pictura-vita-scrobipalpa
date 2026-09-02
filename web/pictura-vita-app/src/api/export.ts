import type { ApiTimeline } from './types';
import { toIso, type DayNumber } from '../layout';

/**
 * Exporting the data.
 *
 * The point is portability: whatever else happens to this application, the data belongs to
 * whoever entered it and must be retrievable in a form that is useful without it.
 *
 * A backup is one file even though the store is now one directory per timeline, because a
 * browser can hand you a file and cannot hand you a directory. So this is a bundle rather
 * than a copy of anything on disk: every timeline, whole, in one array. It restores through
 * `Pictura.Vita.Migration`, which reads exactly this shape and writes the directories back
 * out — and it stays readable without any of that, which is the part that actually matters.
 *
 * Note what a bundle cannot carry: images and narratives are files beside the data, and they
 * are not in here. Copying the timelines directory is still the complete backup.
 */

/** Every timeline, whole. */
export interface ExportPayload {
  timelines: ApiTimeline[];
}

export function buildExportPayload(timelines: ApiTimeline[]): ExportPayload {
  return { timelines };
}

/** Indented and newline-terminated, so successive backups diff cleanly against each other. */
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
