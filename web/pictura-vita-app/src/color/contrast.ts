export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** Null for anything that is not a six-digit hex colour. */
export function parseHex(value: string): Rgb | null {
  const match = HEX.exec(value.trim());
  if (!match) return null;

  const n = Number.parseInt(match[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (c: number) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** Mixes towards white; `amount` of 0 leaves the colour alone, 1 returns white. */
export function lighten(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 17, g: 17, b: 17 };

/**
 * Picks white or black label text for a bar.
 *
 * The bar is a gradient, so the text has to be legible against both ends: the winner is
 * whichever colour has the better *worst-case* contrast, not the better average. This is
 * what the original hard-coded per gradient, and why two of its seven needed black text.
 */
export function readableTextOn(stops: Rgb[]): string {
  const worstCase = (text: Rgb) => Math.min(...stops.map(stop => contrastRatio(text, stop)));
  return worstCase(WHITE) >= worstCase(BLACK) ? toHex(WHITE) : toHex(BLACK);
}

export interface BarStops {
  /** Upper stop: the stored colour itself. */
  from: string;
  /** Lower stop, lifted towards white. */
  to: string;
  /** Label colour that stays legible against both stops. */
  text: string;
}

export interface BarStyle {
  /** Top-to-bottom gradient, as the original had. */
  gradient: string;
  /** Label colour that stays legible against both ends of that gradient. */
  text: string;
}

/**
 * How far the gradient's lower stop is lifted towards white.
 *
 * Chosen by contrast rather than taste: at 0.45 the lighter end washed out enough that
 * four palette colours could not reach 3:1 with either white or black text. 0.32 keeps
 * every one of them at 3.4:1 or better while still reading as a gradient.
 */
const GRADIENT_LIFT = 0.32;

/** The worst-case contrast a bar's label achieves against its own gradient. */
export function labelContrast(color: string): number {
  const base = parseHex(color);
  if (!base) return 0;

  const lifted = lighten(base, GRADIENT_LIFT);
  const text = parseHex(readableTextOn([base, lifted]))!;
  return Math.min(contrastRatio(text, base), contrastRatio(text, lifted));
}

/** Below this, a label is hard to read whichever text colour is chosen. */
export const MIN_READABLE_CONTRAST = 3;

/**
 * Derives a bar's whole appearance from one stored colour, so the data holds a colour
 * rather than a rendering.
 */
export function barStyle(color: string): BarStyle {
  const { from, to, text } = barStops(color);
  return { gradient: `linear-gradient(180deg, ${from}, ${to})`, text };
}

/**
 * The same appearance as `barStyle`, given as the two stops rather than as a CSS gradient.
 *
 * The image export draws an SVG `<linearGradient>`, which needs the stops themselves; going
 * through the CSS string and parsing it back would put a second definition of the same
 * colours a regex apart from the first.
 */
export function barStops(color: string): BarStops {
  const base = parseHex(color) ?? { r: 76, g: 76, b: 76 };
  const lifted = lighten(base, GRADIENT_LIFT);

  return {
    from: toHex(base),
    to: toHex(lifted),
    text: readableTextOn([base, lifted])
  };
}
