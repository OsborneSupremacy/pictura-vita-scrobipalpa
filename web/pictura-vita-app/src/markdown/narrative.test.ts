import { describe, expect, it } from 'vitest';
import { countWords, renderNarrative } from './narrative';

const TIMELINE = '01979e65-0ab5-7a48-85d5-968f1be9f671';

const render = (markdown: string, availableImages: readonly string[] = ['kalamazoo-house.jpg', 'scan.webp']) =>
  renderNarrative(markdown, { timelineId: TIMELINE, availableImages });

describe('renderNarrative', () => {
  it('renders the ordinary Markdown a narrative is made of', () => {
    const html = render('## The drive\n\nIt was **long**, and *cold*.\n\n- one\n- two\n');

    expect(html).toContain('<h2>The drive</h2>');
    expect(html).toContain('<strong>long</strong>');
    expect(html).toContain('<em>cold</em>');
    expect(html).toContain('<li>one</li>');
  });

  it('does not treat a single newline as a line break', () => {
    // CommonMark's rule. Reflowing a paragraph in another editor must not change how it
    // renders, since these files are meant to be edited outside the app.
    expect(render('one\ntwo')).not.toContain('<br');
  });

  describe('raw HTML', () => {
    // The narrative is a file on disk, and this HTML ends up in dangerouslySetInnerHTML.
    it('escapes a script tag rather than passing it through', () => {
      const html = render('before <script>alert(1)</script> after');

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes an event handler smuggled in through an img tag', () => {
      const html = render('<img src=x onerror="alert(1)">');

      expect(html).not.toContain('onerror="alert(1)"');
      expect(html).toContain('&lt;img');
    });
  });

  describe('links', () => {
    it('opens them in a new tab without handing over window.opener', () => {
      const html = render('[the archive](https://example.org/a)');

      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noreferrer noopener"');
    });

    it('refuses a javascript: URL', () => {
      expect(render('[tap](javascript:alert(1))')).not.toContain('href="javascript:');
    });
  });

  describe('images', () => {
    it('resolves a bare name against the timeline image folder', () => {
      const html = render('![The house](kalamazoo-house.jpg)');

      expect(html).toContain(`/timeline/${TIMELINE}/image/kalamazoo-house.jpg`);
      expect(html).toContain('alt="The house"');
      expect(html).toContain('loading="lazy"');
    });

    it('treats a leading ./ as the same bare name', () => {
      expect(render('![](./scan.webp)')).toContain(`/image/scan.webp`);
    });

    // Loading a remote image would be the first outbound request in an application whose
    // premise is that nothing leaves the machine — and would leak which episode is being
    // read, and when, to whoever serves it.
    it.each([
      '![x](https://tracker.example/pixel.gif)',
      '![x](//tracker.example/pixel.gif)',
      '![x](../../etc/passwd)',
      '![x](data:image/gif;base64,R0lGOD)'
    ])('does not load %s', markdown => {
      expect(render(markdown)).not.toContain('<img');
    });

    it('shows the alt text where the picture would have been', () => {
      expect(render('![the pixel](https://tracker.example/pixel.gif)')).toContain('the pixel');
    });

    // The same rule the layout and the detail panel follow: resolve the name against what is
    // actually on disk first, so a stale reference draws as nothing rather than as a broken
    // image in an empty frame.
    it('does not emit an img for a name with no file behind it', () => {
      const html = render('![the house](kalamazoo-house.jpg)', []);

      expect(html).not.toContain('<img');
      expect(html).toContain('the house');
    });
  });
});

describe('countWords', () => {
  it('counts words and not whitespace', () => {
    expect(countWords('  one  two\nthree\t four ')).toBe(4);
  });

  it('is zero for nothing', () => {
    expect(countWords('   ')).toBe(0);
  });
});
