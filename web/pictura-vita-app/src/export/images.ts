import { imageUrl } from '../api/client';
import type { TimelineLayout } from '../layout';

/**
 * Inlining the thumbnails a drawing needs.
 *
 * A rasterized SVG is rendered in isolation: it cannot fetch anything, so a picture that is
 * still a URL when the canvas draws it is simply missing. Every image therefore has to be
 * fetched up front and carried in as bytes.
 *
 * This is also the slowest and largest part of an export, and the part most worth thinking
 * about before sharing one — faces are what a timeline's pictures usually are — which is why
 * thumbnails are a switch in the dialog rather than an assumption here.
 */

/** Every image name the layout actually decided to draw, each once. */
export function drawnImageNames(layout: TimelineLayout): string[] {
  const names = new Set<string>();

  for (const band of layout.bands) {
    const rails = [...band.incidentRailsAbove, ...band.eraRails, ...band.incidentRailsBelow];
    for (const rail of rails) {
      for (const item of rail.items) {
        if (item.imageName) names.add(item.imageName);
      }
    }
  }

  return [...names];
}

async function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches each drawn thumbnail as a data URI.
 *
 * A failure drops that one image rather than the export: on screen a picture that cannot be
 * loaded leaves a gap rather than a broken-image glyph, and an export should not be stricter
 * than the view it is a picture of.
 */
export async function collectThumbnails(
  timelineId: string,
  layout: TimelineLayout
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    drawnImageNames(layout).map(async name => {
      try {
        const response = await fetch(imageUrl(timelineId, name, 'thumb'));
        if (!response.ok) return null;
        return [name, await toDataUri(await response.blob())] as const;
      } catch {
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is [string, string] => entry !== null));
}
