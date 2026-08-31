import { EXPORT_FONT_STACK } from './metrics';
import type { RenderedSvg, TextMeasurer } from './svg';

/**
 * Turning the drawing into something to hand over.
 *
 * Everything here is browser-only and deliberately thin: the drawing itself is done in
 * `svg.ts`, which knows nothing about canvases or downloads. Nothing in this file talks to
 * anything but the local document, which is the point. An export is a file that appears in
 * a downloads folder, not a request to a service.
 */

export function svgBlob(markup: string): Blob {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Measures text the way the browser will actually draw it.
 *
 * The estimate `svg.ts` falls back to is fine for tests, but on a real export it decides
 * where every label is cut, so it is worth the canvas. Results are cached because a
 * timeline of any size asks about the same few fonts a few thousand times.
 */
export function canvasMeasurer(): TextMeasurer {
  const context = document.createElement('canvas').getContext('2d');
  const widths = new Map<string, number>();

  return (text, fontPx, bold) => {
    if (!context) return text.length * fontPx * 0.54;

    const font = `${bold ? '700 ' : ''}${fontPx}px ${EXPORT_FONT_STACK}`;
    const key = `${font} ${text}`;

    const cached = widths.get(key);
    if (cached !== undefined) return cached;

    context.font = font;
    const width = context.measureText(text).width;
    widths.set(key, width);

    return width;
  };
}

/**
 * Rasterizes the drawing to a PNG.
 *
 * The SVG carries its own scaled `width` and `height`, so this is a straight blit with no
 * transform, and no chance of the two disagreeing about the scale.
 */
export async function rasterize(rendered: RenderedSvg): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(rendered.markup));

  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = rendered.width;
    canvas.height = rendered.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser would not provide a canvas to draw on.');

    context.drawImage(image, 0, 0, rendered.width, rendered.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
        'image/png'
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Hands the finished file to the browser's own download machinery. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  // Deferred: revoking synchronously can beat the browser to reading the blob back.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
