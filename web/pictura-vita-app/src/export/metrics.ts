/**
 * The drawn geometry of a timeline, in CSS pixels.
 *
 * On screen these numbers live in `styles.css`; the image export cannot read a stylesheet,
 * so it needs them as values. Two renderers means two chances to disagree, which is the
 * standing risk with an export that reimplements a view — `metrics.test.ts` guards the two
 * that are genuinely shared (the rail heights, declared as custom properties) by reading
 * them back out of the stylesheet. The rest are stated here with the rule they come from,
 * because a value buried in a shorthand cannot be parsed back out with any confidence.
 *
 * Everything horizontal is absent on purpose: widths come from `buildLayout`, which is
 * already the single source of truth for them.
 */

import type { CategoryBand, TimelineLayout } from '../layout';

/** `.axis { height: 30px }` */
export const AXIS_HEIGHT = 30;

/** `--callout-rail-h`. Fixed so a connector's length is computable rather than measured. */
export const CALLOUT_RAIL_HEIGHT = 38;

/** `--era-rail-h`, for the same reason. */
export const ERA_RAIL_HEIGHT = 48;

/** `.rail-era .rail-cell { padding: 2px 0 }`, top and bottom. */
export const ERA_CELL_PADDING_Y = 2;

/** Drawn height of an era bar, inside its cell's padding. */
export const ERA_BAR_HEIGHT = ERA_RAIL_HEIGHT - ERA_CELL_PADDING_Y * 2;

/**
 * `.band-title`: a 12px line at the body's 1.4 line-height (16.8), 3px of padding above and
 * below, and a 1px rule on each side.
 */
export const BAND_TITLE_HEIGHT = 12 * 1.4 + 3 * 2 + 1 * 2;

/** `.band { padding: 0 0 10px }` */
export const BAND_PADDING_BOTTOM = 10;

/** `.surface` border and corner radius. */
export const SURFACE_BORDER = 1;
export const SURFACE_RADIUS = 6;

/** Margin left around the surface, so the timeline is not flush with the image edge. */
export const PAGE_PADDING = 20;

/** `.connector`: a 2px line whose 6px tail carries it into the bar it points at. */
export const CONNECTOR_WIDTH = 2;
export const CONNECTOR_TAIL = 6;

/** `.connector::after`: a 4px-per-side triangle, 5px deep. */
export const ARROW_WIDTH = 8;
export const ARROW_HEIGHT = 5;

/** Corner radii: `.era`, `.era.sliver`, `.incident`. */
export const ERA_RADIUS = 9;
export const SLIVER_RADIUS = 3;
export const INCIDENT_RADIUS = 4;

/** `.era { padding: 4px 5px }` and `.incident { padding: 3px 4px }`. */
export const ERA_PADDING_X = 5;
export const ERA_PADDING_Y = 4;
export const INCIDENT_PADDING_X = 4;
export const INCIDENT_PADDING_Y = 3;

/** The flex `gap` between a thumbnail and the labels beside it. */
export const ITEM_GAP = 5;

/** `--thumb-size` for each rail kind: the cell height less its padding and the item's own. */
export const ERA_THUMB_SIZE = ERA_RAIL_HEIGHT - 12;
export const INCIDENT_THUMB_SIZE = CALLOUT_RAIL_HEIGHT - 6;

/** The body's line-height, which every drawn line inherits. */
export const LINE_HEIGHT = 1.4;

/** `.title` / `.subtitle`, at their two sizes. */
export const ERA_TITLE_PX = 12;
export const ERA_SUBTITLE_PX = 11;
export const INCIDENT_TITLE_PX = 10.5;
export const INCIDENT_SUBTITLE_PX = 10;

/** `.axis-increment { font-size: 12px; font-weight: 600 }` */
export const AXIS_LABEL_PX = 12;

/** `.band-title { font-size: 12px; letter-spacing: 3px }` */
export const BAND_TITLE_PX = 12;
export const BAND_TITLE_LETTER_SPACING = 3;

/** `.band-icon`: 14px, nudged down 2px, 7px clear of the heading. */
export const BAND_ICON_SIZE = 14;
export const BAND_ICON_GAP = 7;
export const BAND_ICON_OPACITY = 0.75;

/** The header block above the timeline, when one is drawn. */
export const HEADER_TITLE_PX = 20;
export const HEADER_META_PX = 13;
export const HEADER_PADDING_BOTTOM = 14;

/**
 * Fraction of the font size from a line's vertical centre down to its alphabetic baseline.
 *
 * SVG's `dominant-baseline` would say this declaratively, but it is honoured inconsistently
 * once an SVG is rasterized through an `<img>`, which is exactly how the PNG is produced.
 * Positioning the baseline arithmetically renders the same everywhere.
 */
export const BASELINE_OFFSET = 0.35;

/**
 * Colours the export has to draw that are not derived from a category's own colour.
 *
 * Each is a literal from `styles.css`; a gradient is given as its stops, since SVG needs
 * them separately. `.era.reference` is drawn at 0.45 opacity there and here.
 */
export const CHROME = {
  page: '#ffffff',
  surface: '#ffffff',
  line: '#d1d5db',
  ink: '#1a1a1a',
  muted: '#6b7280',
  /** `.axis`, top to bottom. */
  axis: ['#5a5a5a', '#2c2c2c', '#131313'] as const,
  axisRule: '#6b6b6b',
  axisLabel: '#ffffff',
  /** `.band-title`, left to right. */
  bandTitle: ['#d7dee3', '#f6f8f9', '#d7dee3'] as const,
  /** `--callout`, top to bottom, and `--callout-edge` for the connectors. */
  callout: ['#f1da36', '#fcf18f'] as const,
  calloutEdge: '#f1da36',
  calloutText: '#3a2f00',
  referenceOpacity: 0.45
} as const;

/**
 * The font stack the export asks for.
 *
 * Deliberately not the `system-ui` the page uses: a rasterized SVG resolves fonts by family
 * name against what is installed, and the generic keywords are the part of that lookup least
 * likely to survive. Naming real faces first keeps the image looking like the screen.
 */
export const EXPORT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Drawn height of one band: its heading, every rail it packs, and the gap beneath it. */
export function bandHeight(band: CategoryBand): number {
  const rails =
    band.incidentRailsAbove.length * CALLOUT_RAIL_HEIGHT +
    band.eraRails.length * ERA_RAIL_HEIGHT +
    band.incidentRailsBelow.length * CALLOUT_RAIL_HEIGHT;

  return BAND_TITLE_HEIGHT + rails + BAND_PADDING_BOTTOM;
}

/** Height of `.surface`: an axis at each end, the bands between them, and its own border. */
export function surfaceHeight(layout: TimelineLayout): number {
  const bands = layout.bands.reduce((total, band) => total + bandHeight(band), 0);
  return SURFACE_BORDER * 2 + AXIS_HEIGHT * 2 + bands;
}

/** Height of the header block, or zero when none is drawn. */
export function headerHeight(header: { subtitle: string } | null): number {
  if (!header) return 0;

  const lines = HEADER_TITLE_PX * LINE_HEIGHT + HEADER_META_PX * LINE_HEIGHT;
  return lines + (header.subtitle ? HEADER_META_PX * LINE_HEIGHT : 0) + HEADER_PADDING_BOTTOM;
}
