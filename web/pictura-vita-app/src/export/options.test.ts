import { describe, expect, it } from 'vitest';
import {
  Confidentiality,
  toDayNumber,
  type LayoutCategory,
  type LayoutEpisode,
  type ResolvedConfidentiality
} from '../layout';
import { PAGE_PADDING, SURFACE_BORDER } from './metrics';
import {
  DEFAULT_EXPORT_OPTIONS,
  exportFileName,
  headerMeta,
  layoutWidthFor,
  slugify,
  visibleEpisodeCount
} from './options';

const day = toDayNumber;

const category = (
  id: string,
  confidentiality: ResolvedConfidentiality = Confidentiality.Public
): LayoutCategory => ({
  categoryId: id,
  title: id,
  icon: '',
  color: '',
  sortOrder: 0,
  confidentiality
});

let sequence = 0;

const episode = (
  confidentiality: LayoutEpisode['confidentiality'],
  categoryIds = ['work']
): LayoutEpisode => ({
  episodeId: `e${(sequence += 1)}`,
  title: 'Title',
  subtitle: '',
  description: '',
  url: '',
  urlDescription: '',
  imageName: '',
  kind: 'era',
  start: day('2001-01-01'),
  end: day('2001-12-31'),
  indefinite: false,
  confidentiality,
  categoryIds
});

describe('export defaults', () => {
  /**
   * The single most consequential line in the feature. An export exists to leave this
   * machine, and nothing downstream can undo an over-wide one, so the default is the
   * narrowest audience rather than whatever the screen happens to be showing.
   */
  it('opens on the narrowest audience', () => {
    expect(DEFAULT_EXPORT_OPTIONS.audience).toBe(Confidentiality.Public);
  });
});

describe('layoutWidthFor', () => {
  it('leaves the margins and the border out of the drawn width', () => {
    expect(layoutWidthFor(1920)).toBe(1920 - PAGE_PADDING * 2 - SURFACE_BORDER * 2);
  });

  it('never asks the layout for a width it cannot divide', () => {
    expect(layoutWidthFor(1)).toBeGreaterThan(0);
  });
});

describe('visibleEpisodeCount', () => {
  const categories = [category('work'), category('health', Confidentiality.OnlyMe)];

  const episodes = [
    episode(Confidentiality.Public),
    episode(Confidentiality.Friends),
    episode(Confidentiality.OnlyMe),
    // Inherits from its category, which is the most private level there is.
    episode(Confidentiality.Inherit, ['health'])
  ];

  it('counts what each audience would actually be handed', () => {
    expect(visibleEpisodeCount(episodes, categories, Confidentiality.Public)).toBe(1);
    expect(visibleEpisodeCount(episodes, categories, Confidentiality.Friends)).toBe(2);
    expect(visibleEpisodeCount(episodes, categories, Confidentiality.OnlyMe)).toBe(4);
  });
});

describe('headerMeta', () => {
  it('states the window, its length and the audience the image was cut for', () => {
    const meta = headerMeta(
      { floor: day('2001-01-01'), ceiling: day('2001-01-10') },
      Confidentiality.Friends
    );

    expect(meta).toBe('2001-01-01 – 2001-01-10 · 10 days · Friends');
  });

  it('does not pluralise a single day', () => {
    const meta = headerMeta(
      { floor: day('2001-01-01'), ceiling: day('2001-01-01') },
      Confidentiality.Public
    );

    expect(meta).toContain('1 day ');
  });
});

describe('exportFileName', () => {
  it('names the file after the timeline and the window, in ISO order', () => {
    expect(
      exportFileName('Ben Osborne', { floor: day('2001-01-01'), ceiling: day('2024-12-31') }, 'png')
    ).toBe('pictura-vita-ben-osborne-2001-01-01-2024-12-31.png');
  });

  it('follows the chosen format', () => {
    expect(
      exportFileName('X', { floor: day('2001-01-01'), ceiling: day('2001-01-02') }, 'svg')
    ).toMatch(/\.svg$/);
  });
});

describe('slugify', () => {
  it('reduces a title to something that survives being emailed', () => {
    expect(slugify("Ada's Life & Times (1815–1852)")).toBe('ada-s-life-times-1815-1852');
  });

  it('falls back rather than producing an empty name', () => {
    expect(slugify('—')).toBe('timeline');
  });
});
