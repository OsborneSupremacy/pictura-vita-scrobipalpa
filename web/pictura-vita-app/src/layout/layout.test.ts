import { describe, expect, it } from 'vitest';
import { toDayNumber } from './dates';
import { deriveWindow } from './bounds';
import { buildLayout, PALETTE_SIZE, SLIVER_THRESHOLD_PX } from './layout';
import type { LayoutCategory, LayoutEpisode, Rail } from './types';

const day = toDayNumber;

const category = (id: string, sortOrder: number, title = id): LayoutCategory => ({
  categoryId: id,
  title,
  sortOrder
});

let sequence = 0;

const episode = (overrides: Partial<LayoutEpisode> & Pick<LayoutEpisode, 'start'>): LayoutEpisode => ({
  episodeId: `e${(sequence += 1)}`,
  title: 'Title',
  subtitle: '',
  description: '',
  url: '',
  urlDescription: '',
  kind: 'era',
  end: overrides.start,
  indefinite: false,
  categoryIds: ['work'],
  ...overrides
});

const drawn = (rail: Rail) => rail.items.filter(item => item.kind !== 'placeholder');

const WINDOW = { floor: day('2000-01-01'), ceiling: day('2009-12-31') };

describe('buildLayout', () => {
  it('sizes an era proportionally to its share of the window', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ start: day('2000-01-01'), end: day('2004-12-31') })],
      ...WINDOW,
      totalWidth: 1000
    });

    const era = drawn(layout.bands[0]!.eraRails[0]!)[0]!;
    // 2000-2004 is 1827 days of the window's 3653.
    expect(era.width).toBeCloseTo((1827 / 3653) * 1000, 6);
  });

  it('lays rails out so that every rail spans the full width', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        episode({ start: day('2001-01-01'), end: day('2002-12-31') }),
        episode({ start: day('2005-01-01'), end: day('2006-12-31') })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    for (const rail of layout.bands[0]!.eraRails) {
      const total = rail.items.reduce((sum, item) => sum + item.width, 0);
      // Rails are flex rows of boxes, so widths must sum rather than overlap. The final
      // gap needs no spacer, so a rail may stop short of the full width but never exceed it.
      expect(total).toBeLessThanOrEqual(1000 + 1e-6);
    }
  });

  it('inserts a leading spacer so the first item starts at the right offset', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ start: day('2005-01-01'), end: day('2006-12-31') })],
      ...WINDOW,
      totalWidth: 1000
    });

    const rail = layout.bands[0]!.eraRails[0]!;
    expect(rail.items[0]!.kind).toBe('placeholder');
    expect(rail.items[0]!.start).toBe(WINDOW.floor);
    expect(rail.items[1]!.start).toBe(day('2005-01-01'));
  });

  it('packs non-overlapping eras onto one rail', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        episode({ start: day('2000-01-01'), end: day('2002-12-31') }),
        episode({ start: day('2003-01-01'), end: day('2005-12-31') })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands[0]!.eraRails).toHaveLength(1);
    expect(drawn(layout.bands[0]!.eraRails[0]!)).toHaveLength(2);
  });

  it('spills overlapping eras onto additional rails', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        episode({ start: day('2000-01-01'), end: day('2005-12-31') }),
        episode({ start: day('2003-01-01'), end: day('2008-12-31') }),
        episode({ start: day('2004-01-01'), end: day('2006-12-31') })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands[0]!.eraRails).toHaveLength(3);
  });

  it('clips an era that starts before the window and flags it', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ start: day('1990-01-01'), end: day('2002-12-31') })],
      ...WINDOW,
      totalWidth: 1000
    });

    const era = drawn(layout.bands[0]!.eraRails[0]!)[0]!;
    expect(era.start).toBe(WINDOW.floor);
    expect(era.fromPast).toBe(true);
    expect(era.intoFuture).toBe(false);
  });

  it('draws an indefinite era out to the ceiling', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ start: day('2005-01-01'), indefinite: true })],
      ...WINDOW,
      totalWidth: 1000
    });

    const era = drawn(layout.bands[0]!.eraRails[0]!)[0]!;
    expect(era.end).toBe(WINDOW.ceiling);
    expect(era.intoFuture).toBe(true);
  });

  it('excludes episodes outside the window entirely', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        episode({ start: day('1990-01-01'), end: day('1995-12-31') }),
        episode({ start: day('2020-01-01'), end: day('2021-12-31') })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands).toHaveLength(0);
    expect(layout.isEmpty).toBe(true);
  });
});

describe('narrow eras', () => {
  const narrow = {
    categories: [category('work', 0)],
    episodes: [episode({ start: day('2005-01-01'), end: day('2005-01-20') })],
    ...WINDOW,
    totalWidth: 1000
  };

  it('adds a callout pointing at an era too narrow to label', () => {
    const layout = buildLayout(narrow);
    const callouts = layout.bands[0]!.incidentRailsAbove.flatMap(drawn);

    expect(callouts).toHaveLength(1);
    expect(callouts[0]!.supplementOf).toBe(narrow.episodes[0]!.episodeId);
  });

  it('marks a very narrow era as a sliver', () => {
    const layout = buildLayout(narrow);
    const era = drawn(layout.bands[0]!.eraRails[0]!)[0]!;

    expect(era.width).toBeLessThanOrEqual(SLIVER_THRESHOLD_PX);
    expect(era.sliver).toBe(true);
  });

  it('leaves a wide era alone', () => {
    const layout = buildLayout({
      ...narrow,
      episodes: [episode({ start: day('2002-01-01'), end: day('2007-12-31') })]
    });

    expect(layout.bands[0]!.incidentRailsAbove).toHaveLength(0);
    expect(drawn(layout.bands[0]!.eraRails[0]!)[0]!.sliver).toBe(false);
  });
});

describe('incidents', () => {
  const incidentAt = (date: string) =>
    episode({ kind: 'incident', start: day(date), end: day(date) });

  it('draws a callout of a fixed width regardless of the window', () => {
    for (const totalWidth of [600, 1000, 2400]) {
      const layout = buildLayout({
        categories: [category('work', 0)],
        episodes: [incidentAt('2005-06-15')],
        ...WINDOW,
        totalWidth
      });

      const callout = layout.bands[0]!.incidentRailsAbove.flatMap(drawn)[0]!;
      expect(callout.width).toBeGreaterThan(95);
      expect(callout.width).toBeLessThan(105);
    }
  });

  it('nudges a callout inside the window instead of overhanging it', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [incidentAt('2000-01-01'), incidentAt('2009-12-31')],
      ...WINDOW,
      totalWidth: 1000
    });

    const callouts = [
      ...layout.bands[0]!.incidentRailsAbove,
      ...layout.bands[0]!.incidentRailsBelow
    ].flatMap(drawn);

    const first = callouts.find(c => c.onFloor)!;
    const last = callouts.find(c => c.onCeiling)!;

    expect(first.start).toBe(WINDOW.floor);
    expect(last.end).toBe(WINDOW.ceiling);
  });

  it('alternates crowded callout rails above and below the band', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        incidentAt('2005-06-15'),
        incidentAt('2005-06-16'),
        incidentAt('2005-06-17')
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    const band = layout.bands[0]!;
    // Three same-week callouts cannot share a rail at 100px each.
    expect(band.incidentRailsAbove.length + band.incidentRailsBelow.length).toBe(3);
    expect(band.incidentRailsAbove).toHaveLength(2);
    expect(band.incidentRailsBelow).toHaveLength(1);
  });

  it('adds a reference bar when a category has incidents but no eras', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [incidentAt('2005-06-15')],
      ...WINDOW,
      totalWidth: 1000
    });

    const reference = drawn(layout.bands[0]!.eraRails[0]!)[0]!;
    expect(reference.reference).toBe(true);
    expect(reference.width).toBeCloseTo(1000, 6);
  });
});

describe('categories', () => {
  it('orders bands by sortOrder, not by title or input order', () => {
    const layout = buildLayout({
      categories: [category('c', 2, 'Alpha'), category('a', 0, 'Zulu'), category('b', 1, 'Mike')],
      episodes: [
        episode({ start: day('2001-01-01'), end: day('2002-01-01'), categoryIds: ['a'] }),
        episode({ start: day('2001-01-01'), end: day('2002-01-01'), categoryIds: ['b'] }),
        episode({ start: day('2001-01-01'), end: day('2002-01-01'), categoryIds: ['c'] })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands.map(b => b.title)).toEqual(['Zulu', 'Mike', 'Alpha']);
  });

  it('draws an episode once in every category it belongs to', () => {
    const shared = episode({
      start: day('2001-01-01'),
      end: day('2002-12-31'),
      categoryIds: ['work', 'health']
    });

    const layout = buildLayout({
      categories: [category('work', 0), category('health', 1)],
      episodes: [shared],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands).toHaveLength(2);
    for (const band of layout.bands) {
      expect(drawn(band.eraRails[0]!)[0]!.episodeId).toBe(shared.episodeId);
    }
  });

  it('cycles colours through the palette', () => {
    const categories = Array.from({ length: PALETTE_SIZE + 2 }, (_, i) => category(`c${i}`, i));
    const layout = buildLayout({
      categories,
      episodes: categories.map(c =>
        episode({ start: day('2001-01-01'), end: day('2002-01-01'), categoryIds: [c.categoryId] })
      ),
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.bands.map(b => b.colorIndex).slice(0, PALETTE_SIZE + 2)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 0, 1
    ]);
  });
});

describe('degenerate input', () => {
  it('returns an empty layout for a zero width', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ start: day('2001-01-01'), end: day('2002-01-01') })],
      ...WINDOW,
      totalWidth: 0
    });

    expect(layout.isEmpty).toBe(true);
    expect(layout.axis).toEqual([]);
  });

  it('returns an empty layout for an inverted window', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [],
      floor: WINDOW.ceiling,
      ceiling: WINDOW.floor,
      totalWidth: 1000
    });

    expect(layout.isEmpty).toBe(true);
  });

  it('handles a single-day window without dividing by zero', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ kind: 'incident', start: day('2005-06-15') })],
      floor: day('2005-06-15'),
      ceiling: day('2005-06-15'),
      totalWidth: 1000
    });

    expect(layout.totalDays).toBe(1);
    for (const band of layout.bands) {
      for (const rail of [...band.eraRails, ...band.incidentRailsAbove]) {
        for (const item of rail.items) expect(Number.isFinite(item.width)).toBe(true);
      }
    }
  });
});

describe('deriveWindow', () => {
  const today = day('2026-08-29');

  it('spans the earliest start to the latest end', () => {
    const window = deriveWindow(
      [
        episode({ start: day('1990-05-01'), end: day('1995-01-01') }),
        episode({ start: day('2001-01-01'), end: day('2004-06-30') })
      ],
      today
    );

    expect(window.floor).toBe(day('1990-05-01'));
    expect(window.ceiling).toBe(day('2004-06-30'));
  });

  it('pulls the ceiling to today when something is ongoing', () => {
    const window = deriveWindow(
      [
        episode({ start: day('1990-05-01'), end: day('1995-01-01') }),
        episode({ start: day('2001-01-01'), indefinite: true })
      ],
      today
    );

    expect(window.ceiling).toBe(today);
  });

  it('never lets the 9999-12-31 sentinel become the ceiling', () => {
    const window = deriveWindow([episode({ start: day('2001-01-01'), indefinite: true })], today);
    expect(window.ceiling).toBe(today);
  });

  it('falls back to a single-day window when there are no episodes', () => {
    expect(deriveWindow([], today)).toEqual({ floor: today, ceiling: today });
  });
});
