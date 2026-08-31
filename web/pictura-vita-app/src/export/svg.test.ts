import { describe, expect, it } from 'vitest';
import {
  buildLayout,
  Confidentiality,
  toDayNumber,
  type LayoutCategory,
  type LayoutEpisode,
  type ResolvedConfidentiality
} from '../layout';
import { CHROME, surfaceHeight } from './metrics';
import { estimateTextWidth, fitText, renderTimelineSvg, type SvgRenderInput } from './svg';

const day = toDayNumber;

const category = (
  id: string,
  sortOrder: number,
  overrides: Partial<LayoutCategory> = {}
): LayoutCategory => ({
  categoryId: id,
  title: id,
  description: '',
  icon: '',
  color: '',
  sortOrder,
  confidentiality: Confidentiality.Public,
  ...overrides
});

let sequence = 0;

const episode = (
  overrides: Partial<LayoutEpisode> & Pick<LayoutEpisode, 'start'>
): LayoutEpisode => ({
  episodeId: `e${(sequence += 1)}`,
  title: 'Title',
  subtitle: '',
  description: '',
  url: '',
  urlDescription: '',
  imageName: '',
  kind: 'era',
  end: overrides.start,
  indefinite: false,
  confidentiality: Confidentiality.Public,
  categoryIds: ['work'],
  ...overrides
});

const WINDOW = {
  floor: day('2000-01-01'),
  ceiling: day('2009-12-31'),
  maxConfidentiality: Confidentiality.OnlyMe as ResolvedConfidentiality,
  visibleCategoryIds: null
};

const render = (input: Partial<SvgRenderInput> & Pick<SvgRenderInput, 'layout'>) =>
  renderTimelineSvg({
    header: null,
    images: new Map(),
    icons: new Map(),
    scale: 1,
    ...input
  });

const simple = (episodes: LayoutEpisode[], totalWidth = 1000) =>
  buildLayout({
    categories: [category('work', 0)],
    episodes,
    ...WINDOW,
    totalWidth
  });

describe('renderTimelineSvg', () => {
  it('draws the episodes and nothing that would have been a control', () => {
    const markup = render({
      layout: simple([episode({ start: day('2001-01-01'), end: day('2004-12-31') })])
    }).markup;

    expect(markup).toContain('Title');
    // The whole reason for a second renderer: there is no markup here that could carry a
    // toolbar, an add button, a hover state or a selection outline into the picture.
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('foreignObject');
  });

  it('scales the raster without changing the drawing', () => {
    const layout = simple([episode({ start: day('2001-01-01'), end: day('2004-12-31') })]);

    const once = render({ layout, scale: 1 });
    const twice = render({ layout, scale: 2 });

    expect(twice.width).toBe(once.width * 2);
    expect(twice.height).toBe(once.height * 2);
    expect(twice.cssHeight).toBe(once.cssHeight);
    // The viewBox is what makes that true: same coordinates, larger canvas.
    expect(twice.markup).toContain(`viewBox="0 0 ${once.cssWidth} ${once.cssHeight}"`);
  });

  it('gives the image room for the header only when one is drawn', () => {
    const layout = simple([episode({ start: day('2001-01-01'), end: day('2004-12-31') })]);

    const bare = render({ layout });
    const titled = render({
      layout,
      header: { title: 'A life', subtitle: '', meta: '2000-01-01 – 2009-12-31' }
    });

    expect(titled.cssHeight).toBeGreaterThan(bare.cssHeight);
    expect(titled.markup).toContain('A life');
    expect(bare.markup).not.toContain('A life');
  });

  it('derives its height from the rails the layout packed', () => {
    const layout = simple([
      episode({ start: day('2001-01-01'), end: day('2004-12-31') }),
      // Overlaps the first, so it has to be packed onto a second era rail.
      episode({ start: day('2003-01-01'), end: day('2006-12-31') })
    ]);

    expect(layout.bands[0]!.eraRails).toHaveLength(2);
    expect(render({ layout }).cssHeight).toBeCloseTo(surfaceHeight(layout) + 40, 6);
  });

  it('squares the clipped end of an episode that runs past the window', () => {
    const layout = simple([
      episode({ start: day('1990-01-01'), end: day('2004-12-31') })
    ]);

    const era = layout.bands[0]!.eraRails[0]!.items.find(item => item.kind === 'era')!;
    expect(era.fromPast).toBe(true);

    // A squared corner is the only signal that the bar continues off the edge, so the path
    // must start at the box's own x and run straight to the top-right arc, with no arc's
    // worth of inset on the left.
    expect(render({ layout }).markup).toMatch(/<path d="M0 [\d.]+ H[\d.]+ A/);
  });

  it('inlines a thumbnail and leaves the box alone when the bytes are missing', () => {
    const withImage = episode({
      start: day('2001-01-01'),
      end: day('2004-12-31'),
      imageName: 'holiday.jpg'
    });

    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [withImage],
      ...WINDOW,
      totalWidth: 1000,
      availableImageNames: new Set(['holiday.jpg'])
    });

    const drawn = render({
      layout,
      images: new Map([['holiday.jpg', 'data:image/png;base64,AAAA']])
    }).markup;

    expect(drawn).toContain('href="data:image/png;base64,AAAA"');
    // A fetch that failed drops the picture, not the bar: the same thing a missing file
    // does on screen.
    expect(render({ layout }).markup).not.toContain('<image');
    expect(render({ layout }).markup).toContain('Title');
  });

  it('draws a callout with a connector reaching the rail its era sits on', () => {
    const layout = simple([
      episode({ start: day('2000-01-01'), end: day('2009-12-31') }),
      episode({ start: day('2005-06-01'), kind: 'incident', title: 'A day' })
    ]);

    expect(layout.bands[0]!.incidentRailsAbove.length).toBeGreaterThan(0);

    const markup = render({ layout }).markup;
    expect(markup).toContain('A day');
    // The line and the arrowhead are both drawn in the callout's own colour.
    expect(markup.match(new RegExp(CHROME.calloutEdge, 'g'))!.length).toBeGreaterThanOrEqual(2);
  });

  it('escapes text that would otherwise close a tag', () => {
    const layout = simple([
      episode({ start: day('2001-01-01'), end: day('2004-12-31'), title: 'Bell & <Howell>' })
    ]);

    const markup = render({ layout }).markup;
    expect(markup).toContain('Bell &amp; &lt;Howell&gt;');
    expect(markup).not.toContain('<Howell>');
  });

  it('draws nothing but the page when the filters leave no bands', () => {
    const layout = buildLayout({
      categories: [category('work', 0)],
      episodes: [],
      ...WINDOW,
      totalWidth: 1000
    });

    expect(layout.isEmpty).toBe(true);
    expect(render({ layout }).markup).not.toContain('<text');
  });
});

describe('fitText', () => {
  const measure = estimateTextWidth;

  it('leaves a label that fits alone', () => {
    expect(fitText('Short', 500, 12, false, measure)).toBe('Short');
  });

  it('ellipsises a label that does not', () => {
    const fitted = fitText('A considerably longer label than will fit', 60, 12, false, measure);

    expect(fitted).toMatch(/…$/);
    expect(measure(fitted, 12, false)).toBeLessThanOrEqual(60);
  });

  it('gives back nothing rather than a bare ellipsis in a box with no room', () => {
    expect(fitText('Anything', 2, 12, false, measure)).toBe('');
  });
});
