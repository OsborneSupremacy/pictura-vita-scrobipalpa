import { barStops } from '../color/contrast';
import { fallbackColor } from '../color/palette';
import type { AxisIncrement, CategoryBand, TimeItem, TimelineLayout } from '../layout';
import * as metrics from './metrics';

/**
 * Drawing a laid-out timeline as SVG.
 *
 * This is a second renderer, not a screenshot of the first. That is a deliberate cost: the
 * alternative is snapshotting the DOM, which makes "no controls in the export" a matter of
 * hiding every button, focus ring and hover affordance and hoping none was missed. Here
 * nothing that is not drawn can appear, the width is an input rather than whatever the
 * window happened to be, and the whole thing stays a pure function of a `TimelineLayout` —
 * so it can be tested the way `layout/` already is, with no DOM and no canvas.
 *
 * Purity is why the two things that genuinely need a browser are parameters: thumbnails
 * arrive already inlined as data URIs (see `images.ts`), and category icons arrive as
 * pre-serialized markup. Text measurement is injectable for the same reason, with an
 * estimate good enough for tests standing in when no measurer is supplied.
 */

/** Width of `text` in pixels at a given size and weight. */
export type TextMeasurer = (text: string, fontPx: number, bold: boolean) => number;

/**
 * A rough measurer, used when the caller has no canvas to hand.
 *
 * The average glyph in this font stack runs a little over half its em. Being approximate
 * only ever costs a label an early ellipsis, never an overflow: every box also clips.
 */
export const estimateTextWidth: TextMeasurer = (text, fontPx, bold) =>
  text.length * fontPx * (bold ? 0.56 : 0.52);

/** The block drawn above the timeline, restoring the context the toolbar was carrying. */
export interface ExportHeader {
  title: string;
  /** Empty for none. */
  subtitle: string;
  /** The window, its length, and the audience the image was cut for. */
  meta: string;
}

export interface SvgRenderInput {
  layout: TimelineLayout;
  /** Null draws the timeline alone. */
  header: ExportHeader | null;
  /** Data URI by image name. A name absent here draws without a thumbnail. */
  images: ReadonlyMap<string, string>;
  /** Serialized `<svg>` for each category icon name that has one. */
  icons: ReadonlyMap<string, string>;
  /** Multiplies the raster's dimensions without touching the layout. */
  scale: number;
  measure?: TextMeasurer;
}

export interface RenderedSvg {
  markup: string;
  /** Dimensions of the raster this produces. */
  width: number;
  height: number;
  /** Dimensions of the drawing itself, before `scale`. */
  cssWidth: number;
  cssHeight: number;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

function xml(text: string): string {
  return text.replace(/[&<>"']/g, character => XML_ESCAPES[character]!);
}

/** Trims a label to fit, with an ellipsis, exactly as `text-overflow` would on screen. */
export function fitText(
  text: string,
  maxWidth: number,
  fontPx: number,
  bold: boolean,
  measure: TextMeasurer
): string {
  if (!text || maxWidth <= 0) return '';
  if (measure(text, fontPx, bold) <= maxWidth) return text;

  let kept = text.length - 1;
  while (kept > 0 && measure(`${text.slice(0, kept)}…`, fontPx, bold) > maxWidth) kept -= 1;

  return kept > 0 ? `${text.slice(0, kept)}…` : '';
}

/**
 * A rectangle with independently rounded corners.
 *
 * `rect`'s `rx` rounds all four, and the clipped ends of an episode are drawn square — that
 * squared-off corner is the only thing that says the bar continues past the window.
 */
function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  left: number,
  right: number
): string {
  const l = Math.min(left, width / 2, height / 2);
  const r = Math.min(right, width / 2, height / 2);

  return [
    `M${x + l} ${y}`,
    `H${x + width - r}`,
    r ? `A${r} ${r} 0 0 1 ${x + width} ${y + r}` : '',
    `V${y + height - r}`,
    r ? `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}` : '',
    `H${x + l}`,
    l ? `A${l} ${l} 0 0 1 ${x} ${y + height - l}` : '',
    `V${y + l}`,
    l ? `A${l} ${l} 0 0 1 ${x + l} ${y}` : '',
    'Z'
  ]
    .filter(Boolean)
    .join(' ');
}

/** The baseline for a line of text whose box runs from `top` for `lineHeight`. */
function baseline(top: number, fontPx: number): number {
  return top + (fontPx * metrics.LINE_HEIGHT) / 2 + fontPx * metrics.BASELINE_OFFSET;
}

interface TextStyle {
  fontPx: number;
  bold: boolean;
  fill: string;
}

function textNode(
  content: string,
  x: number,
  y: number,
  anchor: 'start' | 'middle',
  { fontPx, bold, fill }: TextStyle,
  extra = ''
): string {
  return (
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontPx}"` +
    `${bold ? ' font-weight="700"' : ''} fill="${fill}"${extra}>${xml(content)}</text>`
  );
}

/** One drawing pass, accumulating markup and the definitions it refers to. */
class Canvas {
  readonly defs: string[] = [];
  readonly body: string[] = [];
  private clips = 0;

  /** Registers a clip to a rounded box and returns the id to reference it by. */
  clipTo(path: string): string {
    const id = `clip-${this.clips++}`;
    this.defs.push(`<clipPath id="${id}"><path d="${path}"/></clipPath>`);
    return id;
  }
}

/**
 * Two lines of label inside a box.
 *
 * A box with a thumbnail is a flex row and centres its labels against the picture; one
 * without is a block, so its text sits at the top of the content area. Reproducing both is
 * the difference between a bar that matches the screen and one that is a pixel or three off
 * everywhere a picture happens to be.
 */
function labels(
  item: TimeItem,
  left: number,
  width: number,
  top: number,
  height: number,
  withThumbnail: boolean,
  titlePx: number,
  subtitlePx: number,
  fill: string,
  measure: TextMeasurer
): string {
  const lines: string[] = [];
  const titleHeight = titlePx * metrics.LINE_HEIGHT;
  const subtitleHeight = item.subtitle ? subtitlePx * metrics.LINE_HEIGHT : 0;

  // A box with a picture is a flex row: its labels are left-aligned and centred against
  // the thumbnail. One without is a block, so its text is centred horizontally and sits at
  // the top of the content area.
  const blockTop = withThumbnail ? top + (height - (titleHeight + subtitleHeight)) / 2 : top;
  const anchor = withThumbnail ? 'start' : 'middle';
  const x = withThumbnail ? left : left + width / 2;

  const title = fitText(item.title, width, titlePx, true, measure);
  if (title) {
    lines.push(
      textNode(title, x, baseline(blockTop, titlePx), anchor, {
        fontPx: titlePx,
        bold: true,
        fill
      })
    );
  }

  if (item.subtitle) {
    const subtitle = fitText(item.subtitle, width, subtitlePx, false, measure);
    if (subtitle) {
      lines.push(
        textNode(subtitle, x, baseline(blockTop + titleHeight, subtitlePx), anchor, {
          fontPx: subtitlePx,
          bold: false,
          fill
        },
        ' opacity="0.9"')
      );
    }
  }

  return lines.join('');
}

/** An era bar or an incident callout, with whatever it carries inside it. */
function drawItem(
  canvas: Canvas,
  item: TimeItem,
  x: number,
  top: number,
  input: SvgRenderInput,
  measure: TextMeasurer,
  band: { gradientId: string; text: string }
): void {
  // Placeholders are pure spacing — `visibility: hidden` on screen, nothing at all here.
  if (item.kind === 'placeholder') return;

  const era = item.kind === 'era';
  const boxTop = era ? top + metrics.ERA_CELL_PADDING_Y : top;
  const height = era ? metrics.ERA_BAR_HEIGHT : metrics.CALLOUT_RAIL_HEIGHT;

  const radius = era
    ? item.sliver
      ? metrics.SLIVER_RADIUS
      : metrics.ERA_RADIUS
    : metrics.INCIDENT_RADIUS;

  const path = roundedRect(
    x,
    boxTop,
    item.width,
    height,
    item.fromPast ? 0 : radius,
    item.intoFuture ? 0 : radius
  );

  const fill = era ? `url(#${band.gradientId})` : 'url(#callout-gradient)';
  const opacity = item.reference ? ` opacity="${metrics.CHROME.referenceOpacity}"` : '';

  const parts: string[] = [`<path d="${path}" fill="${fill}"/>`];

  // A sliver is a bare stripe: too narrow for a label, so there is nothing else to draw.
  if (!item.sliver) {
    const padX = era ? metrics.ERA_PADDING_X : metrics.INCIDENT_PADDING_X;
    const padY = era ? metrics.ERA_PADDING_Y : metrics.INCIDENT_PADDING_Y;
    const thumbSize = era ? metrics.ERA_THUMB_SIZE : metrics.INCIDENT_THUMB_SIZE;

    const contentLeft = x + padX;
    const contentWidth = item.width - padX * 2;
    const contentTop = boxTop + padY;
    const contentHeight = height - padY * 2;

    // The layout already decided this is a name that exists in a box wide enough to hold a
    // picture; all that is left is whether the bytes were fetched.
    const source = item.imageName ? input.images.get(item.imageName) : undefined;

    let labelLeft = contentLeft;
    let labelWidth = contentWidth;

    if (source) {
      const thumbTop = boxTop + (height - thumbSize) / 2;
      parts.push(
        `<image href="${xml(source)}" x="${contentLeft}" y="${thumbTop}"` +
          ` width="${thumbSize}" height="${thumbSize}" preserveAspectRatio="xMidYMid meet"/>`
      );

      labelLeft = contentLeft + thumbSize + metrics.ITEM_GAP;
      labelWidth = contentWidth - thumbSize - metrics.ITEM_GAP;
    }

    parts.push(
      labels(
        item,
        labelLeft,
        labelWidth,
        contentTop,
        contentHeight,
        source !== undefined,
        era ? metrics.ERA_TITLE_PX : metrics.INCIDENT_TITLE_PX,
        era ? metrics.ERA_SUBTITLE_PX : metrics.INCIDENT_SUBTITLE_PX,
        era ? band.text : metrics.CHROME.calloutText,
        measure
      )
    );
  }

  const clip = canvas.clipTo(path);

  // The shadow is drawn outside the clip because that is where `box-shadow` paints: clipping
  // a bar to its own outline leaves nothing of a shadow cast beyond it.
  const shadow =
    era && !item.sliver ? `<path d="${path}" fill="${fill}" filter="url(#bar-shadow)"/>` : '';

  canvas.body.push(
    `<g${opacity}>${shadow}<g clip-path="url(#${clip})">${parts.join('')}</g></g>`
  );
}

/** The line and arrowhead joining a callout to the bar it points at. */
function drawConnector(
  canvas: Canvas,
  item: TimeItem,
  x: number,
  cellTop: number,
  direction: 'up' | 'down',
  calloutRailsToCross: number,
  eraRailCount: number
): void {
  if (item.kind === 'placeholder') return;

  const target = item.targetRailIndex ?? (direction === 'down' ? 0 : eraRailCount - 1);
  const eraRailsToCross = direction === 'down' ? target : eraRailCount - 1 - target;

  const length =
    metrics.CALLOUT_RAIL_HEIGHT * calloutRailsToCross +
    metrics.ERA_RAIL_HEIGHT * Math.max(0, eraRailsToCross) +
    metrics.CONNECTOR_TAIL;

  // Drawn at the anchor offset rather than the box's midpoint: a callout nudged away from
  // the edge of the window no longer sits over the date it marks.
  const centre = x + item.anchorOffset;
  const lineTop =
    direction === 'down' ? cellTop + metrics.CALLOUT_RAIL_HEIGHT : cellTop - length;
  const tip = direction === 'down' ? lineTop + length : lineTop;
  const base = direction === 'down' ? tip - metrics.ARROW_HEIGHT : tip + metrics.ARROW_HEIGHT;
  const half = metrics.ARROW_WIDTH / 2;

  canvas.body.push(
    `<rect x="${centre - metrics.CONNECTOR_WIDTH / 2}" y="${lineTop}"` +
      ` width="${metrics.CONNECTOR_WIDTH}" height="${length}"` +
      ` fill="${metrics.CHROME.calloutEdge}"/>` +
      `<path d="M${centre - half} ${base} L${centre + half} ${base} L${centre} ${tip} Z"` +
      ` fill="${metrics.CHROME.calloutEdge}"/>`
  );
}

function drawAxis(
  canvas: Canvas,
  increments: AxisIncrement[],
  top: number,
  width: number,
  measure: TextMeasurer
): void {
  canvas.body.push(
    `<rect x="0" y="${top}" width="${width}" height="${metrics.AXIS_HEIGHT}"` +
      ` fill="url(#axis-gradient)"/>`
  );

  let x = 0;

  for (const [index, increment] of increments.entries()) {
    // `.axis-increment { padding: 0 2px }`, which is what a label has to fit inside.
    const label = fitText(
      increment.label,
      increment.width - 4,
      metrics.AXIS_LABEL_PX,
      true,
      measure
    );

    if (label) {
      canvas.body.push(
        textNode(
          label,
          x + increment.width / 2,
          baseline(top + (metrics.AXIS_HEIGHT - metrics.AXIS_LABEL_PX * metrics.LINE_HEIGHT) / 2,
            metrics.AXIS_LABEL_PX),
          'middle',
          { fontPx: metrics.AXIS_LABEL_PX, bold: true, fill: metrics.CHROME.axisLabel }
        )
      );
    }

    x += increment.width;

    if (index < increments.length - 1) {
      canvas.body.push(
        `<rect x="${x - 1}" y="${top}" width="1" height="${metrics.AXIS_HEIGHT}"` +
          ` fill="${metrics.CHROME.axisRule}"/>`
      );
    }
  }
}

function drawBandTitle(
  canvas: Canvas,
  band: CategoryBand,
  top: number,
  width: number,
  input: SvgRenderInput,
  measure: TextMeasurer
): void {
  canvas.body.push(
    `<rect x="0" y="${top}" width="${width}" height="${metrics.BAND_TITLE_HEIGHT}"` +
      ` fill="url(#band-title-gradient)"/>` +
      `<rect x="0" y="${top}" width="${width}" height="1" fill="${metrics.CHROME.line}"/>` +
      `<rect x="0" y="${top + metrics.BAND_TITLE_HEIGHT - 1}" width="${width}" height="1"` +
      ` fill="${metrics.CHROME.line}"/>`
  );

  // Uppercased here rather than left to `text-transform`, which SVG does not honour.
  const title = band.title.toUpperCase();
  const spacing = metrics.BAND_TITLE_LETTER_SPACING;
  const icon = input.icons.get(band.icon);

  // Letter-spacing is added after every glyph, the last one included, so a centred run sits
  // half a space to the right of true centre unless it is taken back off.
  const titleWidth =
    measure(title, metrics.BAND_TITLE_PX, true) + spacing * Math.max(0, title.length - 1);
  const iconWidth = icon ? metrics.BAND_ICON_SIZE + metrics.BAND_ICON_GAP : 0;
  const start = (width - (titleWidth + iconWidth)) / 2;

  const lineTop = top + 1 + 3;
  const centreY = lineTop + (metrics.BAND_TITLE_PX * metrics.LINE_HEIGHT) / 2;

  if (icon) {
    canvas.body.push(
      `<g transform="translate(${start} ${centreY - metrics.BAND_ICON_SIZE / 2 + 2})"` +
        ` opacity="${metrics.BAND_ICON_OPACITY}" style="color:${metrics.CHROME.ink}">${icon}</g>`
    );
  }

  canvas.body.push(
    textNode(
      title,
      start + iconWidth,
      baseline(lineTop, metrics.BAND_TITLE_PX),
      'start',
      { fontPx: metrics.BAND_TITLE_PX, bold: true, fill: metrics.CHROME.ink },
      ` letter-spacing="${spacing}"`
    )
  );
}

/**
 * One band: its heading, then every connector, then every box.
 *
 * The two passes are the stylesheet's z-index 1 and 2. A connector reaches across the rails
 * between a callout and its bar, so drawing each rail complete in turn would let a line
 * from above cross over a bar below it.
 */
function drawBand(
  canvas: Canvas,
  band: CategoryBand,
  top: number,
  gradientId: string,
  input: SvgRenderInput,
  measure: TextMeasurer
): number {
  drawBandTitle(canvas, band, top, input.layout.totalWidth, input, measure);

  const railsTop = top + metrics.BAND_TITLE_HEIGHT;
  const above = band.incidentRailsAbove;
  const below = band.incidentRailsBelow;
  const erasTop = railsTop + above.length * metrics.CALLOUT_RAIL_HEIGHT;
  const belowTop = erasTop + band.eraRails.length * metrics.ERA_RAIL_HEIGHT;

  above.forEach((rail, index) => {
    let x = 0;
    for (const item of rail.items) {
      drawConnector(
        canvas,
        item,
        x,
        railsTop + index * metrics.CALLOUT_RAIL_HEIGHT,
        'down',
        // The topmost rail is furthest from the bars and has the most rails to cross.
        above.length - 1 - index,
        band.eraRails.length
      );
      x += item.width;
    }
  });

  below.forEach((rail, index) => {
    let x = 0;
    for (const item of rail.items) {
      drawConnector(
        canvas,
        item,
        x,
        belowTop + index * metrics.CALLOUT_RAIL_HEIGHT,
        'up',
        index,
        band.eraRails.length
      );
      x += item.width;
    }
  });

  const style = { gradientId, text: barStops(band.color || fallbackColor(band.colorIndex)).text };

  const rails = [
    ...above.map((rail, index) => ({ rail, top: railsTop + index * metrics.CALLOUT_RAIL_HEIGHT })),
    ...band.eraRails.map((rail, index) => ({
      rail,
      top: erasTop + index * metrics.ERA_RAIL_HEIGHT
    })),
    ...below.map((rail, index) => ({ rail, top: belowTop + index * metrics.CALLOUT_RAIL_HEIGHT }))
  ];

  for (const { rail, top: railTop } of rails) {
    let x = 0;
    for (const item of rail.items) {
      drawItem(canvas, item, x, railTop, input, measure, style);
      x += item.width;
    }
  }

  return metrics.bandHeight(band);
}

function drawHeader(
  body: string[],
  header: ExportHeader,
  top: number,
  width: number,
  measure: TextMeasurer
): void {
  let y = top;
  const x = metrics.PAGE_PADDING;

  body.push(
    textNode(
      fitText(header.title, width, metrics.HEADER_TITLE_PX, true, measure),
      x,
      baseline(y, metrics.HEADER_TITLE_PX),
      'start',
      { fontPx: metrics.HEADER_TITLE_PX, bold: true, fill: metrics.CHROME.ink }
    )
  );

  y += metrics.HEADER_TITLE_PX * metrics.LINE_HEIGHT;

  for (const line of [header.subtitle, header.meta].filter(Boolean)) {
    body.push(
      textNode(
        fitText(line, width, metrics.HEADER_META_PX, false, measure),
        x,
        baseline(y, metrics.HEADER_META_PX),
        'start',
        { fontPx: metrics.HEADER_META_PX, bold: false, fill: metrics.CHROME.muted }
      )
    );
    y += metrics.HEADER_META_PX * metrics.LINE_HEIGHT;
  }
}

function gradientDefs(layout: TimelineLayout): string[] {
  const defs = [
    `<linearGradient id="axis-gradient" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${metrics.CHROME.axis[0]}"/>` +
      `<stop offset="0.5" stop-color="${metrics.CHROME.axis[1]}"/>` +
      `<stop offset="1" stop-color="${metrics.CHROME.axis[2]}"/></linearGradient>`,
    `<linearGradient id="band-title-gradient" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${metrics.CHROME.bandTitle[0]}"/>` +
      `<stop offset="0.5" stop-color="${metrics.CHROME.bandTitle[1]}"/>` +
      `<stop offset="1" stop-color="${metrics.CHROME.bandTitle[2]}"/></linearGradient>`,
    `<linearGradient id="callout-gradient" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${metrics.CHROME.callout[0]}"/>` +
      `<stop offset="1" stop-color="${metrics.CHROME.callout[1]}"/></linearGradient>`,
    // `.era`'s box-shadow. Kept subtle for the same reason it is subtle on screen: it
    // separates a bar from the one behind it without reading as a drop shadow.
    `<filter id="bar-shadow" x="-5%" y="-15%" width="110%" height="140%">` +
      `<feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.35"/></filter>`
  ];

  layout.bands.forEach((band, index) => {
    const { from, to } = barStops(band.color || fallbackColor(band.colorIndex));
    defs.push(
      `<linearGradient id="band-${index}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${from}"/>` +
        `<stop offset="1" stop-color="${to}"/></linearGradient>`
    );
  });

  return defs;
}

/** Draws a laid-out timeline, with nothing on it that cannot be shared. */
export function renderTimelineSvg(input: SvgRenderInput): RenderedSvg {
  const { layout, header, scale } = input;
  const measure = input.measure ?? estimateTextWidth;

  const surfaceWidth = layout.totalWidth + metrics.SURFACE_BORDER * 2;
  const surfaceTop = metrics.PAGE_PADDING + metrics.headerHeight(header);

  const cssWidth = surfaceWidth + metrics.PAGE_PADDING * 2;
  const cssHeight = surfaceTop + metrics.surfaceHeight(layout) + metrics.PAGE_PADDING;

  // One canvas owns every definition; the header and the timeline keep separate bodies
  // because they are drawn in different coordinate systems. Everything below the header is
  // placed in the surface's own space, so the layout's x values are used as they come out
  // of `buildLayout` with no arithmetic in between.
  const canvas = new Canvas();
  canvas.defs.push(...gradientDefs(layout));

  const headerBody: string[] = [];
  if (header) {
    drawHeader(headerBody, header, metrics.PAGE_PADDING, layout.totalWidth, measure);
  }

  const interior = canvas;

  // An axis with nothing under it is not a smaller picture of the timeline, it is a picture
  // of a ruler. The view draws a message in its place; an export that cannot say anything
  // draws an empty surface and lets the dialog explain why.
  let y = metrics.AXIS_HEIGHT;

  if (!layout.isEmpty) {
    drawAxis(interior, layout.axis, 0, layout.totalWidth, measure);

    layout.bands.forEach((band, index) => {
      y += drawBand(interior, band, y, `band-${index}`, input, measure);
    });

    drawAxis(interior, layout.axis, y, layout.totalWidth, measure);
  }

  const surfaceInnerHeight = y + metrics.AXIS_HEIGHT;
  const surfaceClip = interior.clipTo(
    roundedRect(0, 0, layout.totalWidth, surfaceInnerHeight, metrics.SURFACE_RADIUS,
      metrics.SURFACE_RADIUS)
  );

  const surfaceX = metrics.PAGE_PADDING + metrics.SURFACE_BORDER;
  const surfaceY = surfaceTop + metrics.SURFACE_BORDER;

  // Rounded here as well as in the returned dimensions, so the canvas that rasterizes this
  // is never a fraction of a pixel out of step with what the drawing says it is.
  const pixelWidth = Math.round(cssWidth * scale);
  const pixelHeight = Math.round(cssHeight * scale);

  const markup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}"`,
    ` height="${pixelHeight}" viewBox="0 0 ${cssWidth} ${cssHeight}"`,
    ` font-family="${metrics.EXPORT_FONT_STACK}">`,
    `<defs>${interior.defs.join('')}</defs>`,
    `<rect width="${cssWidth}" height="${cssHeight}" fill="${metrics.CHROME.page}"/>`,
    headerBody.join(''),
    `<rect x="${metrics.PAGE_PADDING + 0.5}" y="${surfaceTop + 0.5}"`,
    ` width="${surfaceWidth - 1}" height="${surfaceInnerHeight + 1}"`,
    ` rx="${metrics.SURFACE_RADIUS}" fill="${metrics.CHROME.surface}"`,
    ` stroke="${metrics.CHROME.line}" stroke-width="1"/>`,
    `<g transform="translate(${surfaceX} ${surfaceY})" clip-path="url(#${surfaceClip})">`,
    interior.body.join(''),
    `</g>`,
    `</svg>`
  ].join('');

  return { markup, width: pixelWidth, height: pixelHeight, cssWidth, cssHeight };
}
