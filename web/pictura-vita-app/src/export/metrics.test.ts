import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CALLOUT_RAIL_HEIGHT, ERA_RAIL_HEIGHT } from './metrics';

/**
 * The guard against the export drifting away from the view.
 *
 * Drawing the timeline twice — once as DOM, once as SVG — buys an export that cannot leak a
 * control into the picture, at the cost of two definitions of the same geometry. These two
 * are the ones the stylesheet states as values rather than burying in a shorthand, so they
 * can be read back and compared. Changing one without the other is exactly the failure this
 * arrangement invites, and it is silent everywhere else.
 */
function customProperty(css: string, name: string): number {
  const match = new RegExp(`${name}:\\s*([0-9.]+)px`).exec(css);
  expect(match, `${name} is no longer declared in styles.css`).not.toBeNull();
  return Number(match![1]);
}

describe('export metrics', () => {
  const css = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');

  it('uses the callout rail height the stylesheet draws', () => {
    expect(CALLOUT_RAIL_HEIGHT).toBe(customProperty(css, '--callout-rail-h'));
  });

  it('uses the era rail height the stylesheet draws', () => {
    expect(ERA_RAIL_HEIGHT).toBe(customProperty(css, '--era-rail-h'));
  });
});
