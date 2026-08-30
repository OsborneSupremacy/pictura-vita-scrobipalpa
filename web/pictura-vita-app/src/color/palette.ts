/**
 * The offered swatches.
 *
 * The first seven are the original application's gradients, so a timeline that predates
 * stored colours keeps the look it had. The rest widen the set enough that a timeline with
 * a dozen categories need not repeat itself.
 */
export const PALETTE = [
  '#4c4c4c', // grey
  '#1e5799', // blue
  '#20a020', // green
  '#e52d2d', // red
  '#c97800', // orange
  '#5d22aa', // purple
  '#a8a820', // olive
  '#0f766e', // teal
  '#be185d', // pink
  '#7c2d12', // brown
  '#1d4ed8', // indigo
  '#65a30d', // lime
  '#0891b2', // cyan
  '#9333ea'  // violet
] as const;

/**
 * The colour a band falls back to when none is stored: its position in the timeline, as
 * before. Kept only as a default — once a category has a colour of its own, reordering no
 * longer repaints it.
 */
export function fallbackColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0];
}
