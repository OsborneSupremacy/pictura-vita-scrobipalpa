import {
  Confidentiality,
  daySpan,
  filterByConfidentiality,
  toIso,
  type DayNumber,
  type LayoutCategory,
  type LayoutEpisode,
  type ResolvedConfidentiality,
  type Window
} from '../layout';
import { PAGE_PADDING, SURFACE_BORDER } from './metrics';

/**
 * What the image export is asked for.
 *
 * The set is deliberately small. Anything the timeline already knows — which categories are
 * showing, what the current zoom is — is inherited rather than asked again, and anything the
 * format decides for us (PNG is lossless; a canvas writes no EXIF) is not a question.
 */

export type ExportFormat = 'png' | 'svg';

/** The window to draw: what is on screen, or the timeline entire. */
export type ExportRange = 'view' | 'whole';

export interface ExportOptions {
  format: ExportFormat;
  /** The most private level to draw. Baked in: a picture cannot be re-filtered later. */
  audience: ResolvedConfidentiality;
  range: ExportRange;
  /** Width of the finished image, from which the drawn width is derived. */
  imageWidth: number;
  /** Multiplies pixels without changing the layout. PNG only; SVG scales on its own. */
  scale: 1 | 2;
  thumbnails: boolean;
  header: boolean;
}

/**
 * Widths worth offering.
 *
 * Width is an input to `buildLayout`, not a zoom applied afterwards: a wider export gives
 * narrow eras room for a label and stops generating callouts for them. So these are not
 * three sizes of the same picture, and the dialog says so.
 */
export const EXPORT_WIDTHS = [1200, 1920, 3000] as const;

/**
 * Public by default, whatever the screen is currently showing.
 *
 * The export exists so the file can leave this machine, and there is no un-sharing a PNG.
 * Inheriting the on-screen audience would make the safe outcome depend on remembering to
 * change a filter first; defaulting to the narrowest audience makes it depend on deciding
 * to widen one, which is a decision rather than an omission.
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'png',
  audience: Confidentiality.Public,
  range: 'view',
  imageWidth: 1920,
  scale: 2,
  thumbnails: true,
  header: true
};

/** The drawn width inside an image of the requested size: its margins and border removed. */
export function layoutWidthFor(imageWidth: number): number {
  return Math.max(1, Math.round(imageWidth - PAGE_PADDING * 2 - SURFACE_BORDER * 2));
}

/** How many episodes a given audience would see, for the dialog to state before exporting. */
export function visibleEpisodeCount(
  episodes: LayoutEpisode[],
  categories: LayoutCategory[],
  audience: ResolvedConfidentiality
): number {
  return filterByConfidentiality(episodes, categories, audience).length;
}

export const AUDIENCE_LABELS: Record<ResolvedConfidentiality, string> = {
  [Confidentiality.Public]: 'Public',
  [Confidentiality.Friends]: 'Friends',
  [Confidentiality.OnlyMe]: 'Everything'
};

/**
 * The line beneath the title: the window, its length, and who the image was cut for.
 *
 * The audience is stated on the picture on purpose. Once the toolbar is gone there is
 * nothing else to say whether what you are looking at is safe to hand over, and a file that
 * has been sitting in a downloads folder for a month cannot be asked.
 */
export function headerMeta(window: Window, audience: ResolvedConfidentiality): string {
  const days = daySpan(window.floor, window.ceiling);

  return (
    `${toIso(window.floor)} – ${toIso(window.ceiling)} · ` +
    `${days.toLocaleString()} ${days === 1 ? 'day' : 'days'} · ${AUDIENCE_LABELS[audience]}`
  );
}

/** A file-name-safe form of a title: lower case, words joined by hyphens, nothing else. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      // Anything that is not a letter or a digit becomes a separator, accents included: the
      // point is a name that survives being emailed, not one that reads well.
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'timeline'
  );
}

/**
 * Named after the timeline and the window it shows, dated in ISO order.
 *
 * The same reasoning as the JSON backup's name: successive exports of different windows
 * sort together and never silently overwrite one another.
 */
export function exportFileName(
  title: string,
  window: { floor: DayNumber; ceiling: DayNumber },
  format: ExportFormat
): string {
  return `pictura-vita-${slugify(title)}-${toIso(window.floor)}-${toIso(window.ceiling)}.${format}`;
}
