import { describe, expect, it } from 'vitest';
import {
  MIN_READABLE_CONTRAST,
  barStyle,
  labelContrast,
  contrastRatio,
  lighten,
  parseHex,
  readableTextOn,
  relativeLuminance,
  toHex
} from './contrast';
import { PALETTE, fallbackColor } from './palette';

describe('parseHex', () => {
  it('reads six-digit hex, with or without the hash', () => {
    expect(parseHex('#1e5799')).toEqual({ r: 30, g: 87, b: 153 });
    expect(parseHex('1e5799')).toEqual({ r: 30, g: 87, b: 153 });
  });

  it('is case insensitive and tolerates surrounding space', () => {
    expect(parseHex('  #1E5799 ')).toEqual(parseHex('#1e5799'));
  });

  it('rejects anything else rather than guessing', () => {
    for (const bad of ['#fff', 'rebeccapurple', '#12345', '#1234567', '', 'nonsense']) {
      expect(parseHex(bad)).toBeNull();
    }
  });

  it('round-trips through toHex', () => {
    for (const color of PALETTE) expect(toHex(parseHex(color)!)).toBe(color);
  });
});

describe('relativeLuminance', () => {
  it('runs from black to white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('weights green above red above blue, as perception does', () => {
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 2);
    expect(contrastRatio({ r: 30, g: 87, b: 153 }, { r: 30, g: 87, b: 153 })).toBeCloseTo(1, 5);
  });

  it('does not depend on argument order', () => {
    const a = { r: 30, g: 87, b: 153 };
    const b = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe('lighten', () => {
  it('leaves the colour alone at zero and reaches white at one', () => {
    const base = { r: 30, g: 87, b: 153 };
    expect(lighten(base, 0)).toEqual(base);
    expect(toHex(lighten(base, 1))).toBe('#ffffff');
  });

  it('always raises luminance', () => {
    for (const color of PALETTE) {
      const base = parseHex(color)!;
      expect(relativeLuminance(lighten(base, 0.45))).toBeGreaterThan(relativeLuminance(base));
    }
  });
});

describe('readableTextOn', () => {
  it('chooses white over a dark bar and black over a light one', () => {
    expect(readableTextOn([{ r: 20, g: 20, b: 20 }])).toBe('#ffffff');
    expect(readableTextOn([{ r: 245, g: 245, b: 245 }])).toBe('#111111');
  });

  it('judges by the worst end of a gradient, not the average', () => {
    // Dark at the top, near-white at the bottom: white text would vanish at the bottom
    // even though it reads perfectly at the top.
    const stops = [{ r: 40, g: 40, b: 40 }, { r: 250, g: 250, b: 250 }];
    expect(readableTextOn(stops)).toBe('#111111');
  });
});

describe('barStyle', () => {
  it('derives a two-stop gradient and a label colour from one value', () => {
    const style = barStyle('#1e5799');
    expect(style.gradient).toMatch(/^linear-gradient\(180deg, #1e5799, #[0-9a-f]{6}\)$/);
    expect(['#ffffff', '#111111']).toContain(style.text);
  });

  it('keeps every palette colour legible against both ends of its own gradient', () => {
    for (const color of PALETTE) {
      const { text } = barStyle(color);
      const base = parseHex(color)!;
      const lifted = lighten(base, 0.32);
      const textRgb = parseHex(text)!;
      const worst = Math.min(contrastRatio(textRgb, base), contrastRatio(textRgb, lifted));
      // 3:1 is the WCAG threshold for large text, which the bar labels are not far off.
      expect(worst).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to a readable grey rather than throwing on bad input', () => {
    expect(barStyle('not a colour').gradient).toContain('#4c4c4c');
    expect(barStyle('').text).toBe('#ffffff');
  });
});

describe('labelContrast', () => {
  it('reports every palette colour as readable', () => {
    for (const color of PALETTE) {
      expect(labelContrast(color)).toBeGreaterThanOrEqual(MIN_READABLE_CONTRAST);
    }
  });

  it('keeps any colour at all readable, not just the palette', () => {
    // The gradient is what guarantees this: whatever the base colour, one end of the bar
    // ends up light enough for black text or dark enough for white. Sweeping the cube is
    // the check that the chosen lift actually delivers it, so a custom colour cannot
    // produce an illegible label.
    let worst = Number.POSITIVE_INFINITY;
    let worstColor = '';

    for (let r = 0; r < 256; r += 17)
      for (let g = 0; g < 256; g += 17)
        for (let b = 0; b < 256; b += 17) {
          const color = toHex({ r, g, b });
          const score = labelContrast(color);
          if (score < worst) {
            worst = score;
            worstColor = color;
          }
        }

    expect(worst, `worst case was ${worstColor}`).toBeGreaterThanOrEqual(MIN_READABLE_CONTRAST);
  });

  it('is zero for a value that is not a colour', () => {
    expect(labelContrast('nonsense')).toBe(0);
  });
});

describe('fallbackColor', () => {
  it('cycles through the palette', () => {
    expect(fallbackColor(0)).toBe(PALETTE[0]);
    expect(fallbackColor(PALETTE.length)).toBe(PALETTE[0]);
    expect(fallbackColor(PALETTE.length + 3)).toBe(PALETTE[3]);
  });
});
