import { describe, expect, it } from 'vitest';
import { toDayNumber } from './dates';
import { deriveWindow } from './bounds';
import {
  buildLayout,
  filterByConfidentiality,
  PALETTE_SIZE,
  SLIVER_THRESHOLD_PX
} from './layout';
import { Confidentiality } from './types';
import type { LayoutCategory, LayoutEpisode, Rail, ResolvedConfidentiality } from './types';

const day = toDayNumber;

const category = (
  id: string,
  sortOrder: number,
  title = id,
  confidentiality: ResolvedConfidentiality = Confidentiality.Public
): LayoutCategory => ({
  categoryId: id,
  title,
  sortOrder,
  confidentiality
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
  confidentiality: Confidentiality.Public,
  categoryIds: ['work'],
  ...overrides
});

const drawn = (rail: Rail) => rail.items.filter(item => item.kind !== 'placeholder');

const WINDOW = {
  floor: day('2000-01-01'),
  ceiling: day('2009-12-31'),
  // Defaults for the filters; individual tests override them.
  maxConfidentiality: Confidentiality.OnlyMe as ResolvedConfidentiality,
  visibleCategoryIds: null
};

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

  it('records which era rail the callout has to reach', () => {
    // Three narrow eras overlapping in time, so they are forced onto three separate rails.
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        episode({ start: day('2005-01-01'), end: day('2005-01-20'), title: 'A' }),
        episode({ start: day('2005-01-05'), end: day('2005-01-25'), title: 'B' }),
        episode({ start: day('2005-01-10'), end: day('2005-01-30'), title: 'C' })
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    const band = layout.bands[0]!;
    expect(band.eraRails).toHaveLength(3);

    const callouts = [...band.incidentRailsAbove, ...band.incidentRailsBelow].flatMap(drawn);
    expect(callouts).toHaveLength(3);

    // Each callout must point at the rail its own bar landed on, not simply the nearest one.
    for (const callout of callouts) {
      const railIndex = band.eraRails.findIndex(rail =>
        rail.items.some(item => item.episodeId === callout.supplementOf)
      );
      expect(callout.targetRailIndex).toBe(railIndex);
    }

    expect(new Set(callouts.map(c => c.targetRailIndex))).toEqual(new Set([0, 1, 2]));
  });

  it('leaves a real incident without an era target', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [episode({ kind: 'incident', start: day('2005-06-15') })],
      ...WINDOW,
      totalWidth: 1000
    });

    const callout = layout.bands[0]!.incidentRailsAbove.flatMap(drawn)[0]!;
    expect(callout.targetRailIndex).toBeNull();
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

  it('puts the anchor at the middle of a callout that is not nudged', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [incidentAt('2005-06-15')],
      ...WINDOW,
      totalWidth: 1000
    });

    const callout = layout.bands[0]!.incidentRailsAbove.flatMap(drawn)[0]!;
    expect(callout.anchorOffset).toBeCloseTo(callout.width / 2, 0);
  });

  it('moves the anchor to the edge of a callout that has been nudged inward', () => {
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

    // The box slides inward but the date it marks does not, so the connector has to be
    // drawn at the very edge of the box rather than down its middle.
    expect(callouts.find(c => c.onFloor)!.anchorOffset).toBeCloseTo(0, 0);
    expect(callouts.find(c => c.onCeiling)!.anchorOffset).toBeCloseTo(
      callouts.find(c => c.onCeiling)!.width,
      0
    );
  });

  it('never puts the anchor outside the box', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [
        incidentAt('2000-01-01'),
        incidentAt('2005-06-15'),
        incidentAt('2009-12-31')
      ],
      ...WINDOW,
      totalWidth: 1000
    });

    const callouts = [
      ...layout.bands[0]!.incidentRailsAbove,
      ...layout.bands[0]!.incidentRailsBelow
    ].flatMap(drawn);

    expect(callouts).not.toHaveLength(0);
    for (const callout of callouts) {
      expect(callout.anchorOffset).toBeGreaterThanOrEqual(0);
      expect(callout.anchorOffset).toBeLessThanOrEqual(callout.width);
    }
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

describe('confidentiality filter', () => {
  const spanning = (conf: Confidentiality, categoryIds = ['work']) =>
    episode({
      start: day('2001-01-01'),
      end: day('2002-12-31'),
      confidentiality: conf,
      categoryIds
    });

  const bandCount = (
    maxConfidentiality: ResolvedConfidentiality,
    episodes: LayoutEpisode[],
    categories: LayoutCategory[]
  ) =>
    buildLayout({ categories, episodes, ...WINDOW, maxConfidentiality, totalWidth: 1000 }).bands;

  it('hides anything more private than the selected level', () => {
    const episodes = [
      spanning(Confidentiality.Public),
      spanning(Confidentiality.Friends),
      spanning(Confidentiality.OnlyMe)
    ];
    const categories = [category('work', 0)];

    expect(bandCount(Confidentiality.OnlyMe, episodes, categories)[0]!.eraRails.flatMap(drawn))
      .toHaveLength(3);
    expect(bandCount(Confidentiality.Friends, episodes, categories)[0]!.eraRails.flatMap(drawn))
      .toHaveLength(2);
    expect(bandCount(Confidentiality.Public, episodes, categories)[0]!.eraRails.flatMap(drawn))
      .toHaveLength(1);
  });

  it('takes the level from the category when the episode inherits', () => {
    const episodes = [spanning(Confidentiality.Inherit)];
    const categories = [category('work', 0, 'work', Confidentiality.OnlyMe)];

    expect(bandCount(Confidentiality.OnlyMe, episodes, categories)).toHaveLength(1);
    expect(bandCount(Confidentiality.Public, episodes, categories)).toHaveLength(0);
  });

  it('shows an inheriting episode in one category and hides it in another', () => {
    // The behaviour the original got for free from its row-per-category SQL join: one
    // episode, two categories at different levels, so it is public in one and not the other.
    const episodes = [spanning(Confidentiality.Inherit, ['open', 'closed'])];
    const categories = [
      category('open', 0, 'Open', Confidentiality.Public),
      category('closed', 1, 'Closed', Confidentiality.OnlyMe)
    ];

    expect(bandCount(Confidentiality.OnlyMe, episodes, categories).map(b => b.title))
      .toEqual(['Open', 'Closed']);
    expect(bandCount(Confidentiality.Public, episodes, categories).map(b => b.title))
      .toEqual(['Open']);
  });

  it("does not let an episode's own level be overridden by its category", () => {
    // An explicit level wins over the category's, in both directions.
    const inPrivateCategory = [spanning(Confidentiality.Public)];
    const categories = [category('work', 0, 'work', Confidentiality.OnlyMe)];
    expect(bandCount(Confidentiality.Public, inPrivateCategory, categories)).toHaveLength(1);

    const inPublicCategory = [spanning(Confidentiality.OnlyMe)];
    const openCategories = [category('work', 0, 'work', Confidentiality.Public)];
    expect(bandCount(Confidentiality.Public, inPublicCategory, openCategories)).toHaveLength(0);
  });

  it('drops a band whose every episode is filtered out', () => {
    const episodes = [
      spanning(Confidentiality.Public, ['open']),
      spanning(Confidentiality.OnlyMe, ['closed'])
    ];
    const categories = [
      category('open', 0, 'Open', Confidentiality.Public),
      category('closed', 1, 'Closed', Confidentiality.Public)
    ];

    expect(bandCount(Confidentiality.Public, episodes, categories).map(b => b.title))
      .toEqual(['Open']);
  });
});

describe('filterByConfidentiality', () => {
  it('keeps an episode visible through any one of its categories', () => {
    const shared = episode({
      start: day('2001-01-01'),
      end: day('2002-12-31'),
      confidentiality: Confidentiality.Inherit,
      categoryIds: ['open', 'closed']
    });
    const categories = [
      category('open', 0, 'Open', Confidentiality.Public),
      category('closed', 1, 'Closed', Confidentiality.OnlyMe)
    ];

    expect(filterByConfidentiality([shared], categories, Confidentiality.Public)).toHaveLength(1);
  });

  it('drops an episode hidden in every category it belongs to', () => {
    const hidden = episode({
      start: day('2001-01-01'),
      end: day('2002-12-31'),
      confidentiality: Confidentiality.Inherit,
      categoryIds: ['closed']
    });
    const categories = [category('closed', 0, 'Closed', Confidentiality.OnlyMe)];

    expect(filterByConfidentiality([hidden], categories, Confidentiality.Public)).toHaveLength(0);
  });

  it('ignores category ids that do not resolve', () => {
    const orphan = episode({
      start: day('2001-01-01'),
      end: day('2002-12-31'),
      confidentiality: Confidentiality.Public,
      categoryIds: ['missing']
    });

    expect(filterByConfidentiality([orphan], [], Confidentiality.OnlyMe)).toHaveLength(0);
  });
});

describe('category filter', () => {
  const twoCategories = {
    categories: [category('work', 0, 'Work'), category('health', 1, 'Health')],
    episodes: [
      episode({ start: day('2001-01-01'), end: day('2002-12-31'), categoryIds: ['work'] }),
      episode({ start: day('2001-01-01'), end: day('2002-12-31'), categoryIds: ['health'] })
    ]
  };

  it('draws every category when no selection is given', () => {
    const layout = buildLayout({ ...twoCategories, ...WINDOW, totalWidth: 1000 });
    expect(layout.bands.map(b => b.title)).toEqual(['Work', 'Health']);
  });

  it('draws only the selected categories', () => {
    const layout = buildLayout({
      ...twoCategories,
      ...WINDOW,
      visibleCategoryIds: new Set(['health']),
      totalWidth: 1000
    });
    expect(layout.bands.map(b => b.title)).toEqual(['Health']);
  });

  it('is empty when nothing is selected', () => {
    const layout = buildLayout({
      ...twoCategories,
      ...WINDOW,
      visibleCategoryIds: new Set<string>(),
      totalWidth: 1000
    });
    expect(layout.bands).toHaveLength(0);
    expect(layout.isEmpty).toBe(true);
  });

  it('keeps colours tied to the categories still shown', () => {
    // Colours come from position among the drawn bands, so hiding one renumbers the rest.
    const layout = buildLayout({
      ...twoCategories,
      ...WINDOW,
      visibleCategoryIds: new Set(['health']),
      totalWidth: 1000
    });
    expect(layout.bands[0]!.colorIndex).toBe(0);
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
      maxConfidentiality: WINDOW.maxConfidentiality,
      visibleCategoryIds: null,
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
      maxConfidentiality: WINDOW.maxConfidentiality,
      visibleCategoryIds: null,
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
