import MarkdownIt from 'markdown-it';
import { imageUrl } from '../api/client';

/**
 * Turning a narrative's Markdown into HTML.
 *
 * The text comes out of a file on disk, and a file on disk is an input — the same position
 * an image name is in. It is normally the user's own prose, but "normally" is not a security
 * model for something that ends up in `dangerouslySetInnerHTML`, and the narrative directory
 * is meant to be copied between machines and handed to people.
 *
 * Two settings do the work:
 *
 * - `html: false` escapes raw HTML rather than passing it through, so a `<script>` or an
 *   `<img onerror=…>` in a file renders as the text it is. That is why there is no sanitizer
 *   here: nothing dangerous is ever produced to sanitize. It also means a stray angle bracket
 *   in prose shows up as a stray angle bracket instead of silently eating a paragraph.
 * - Images are resolved against the timeline's own image folder and nothing else — see
 *   `resolveImageSource`. Links are left alone: a link is followed when the reader clicks it,
 *   which is their decision to make, and markdown-it's own validation already refuses
 *   `javascript:` and friends.
 */

const md = new MarkdownIt({
  html: false,
  // A bare URL in prose is far more likely to be meant as a link than not.
  linkify: true,
  // Prose, not documentation: curly quotes and proper dashes are worth having.
  typographer: true,
  // CommonMark's rule, deliberately: a single newline is not a line break. Reflowing a
  // paragraph in another editor would otherwise change how it renders.
  breaks: false
});

/** Passed through `md.render` so the image rule can resolve a bare name. */
export interface NarrativeContext {
  timelineId: string;
  /**
   * Image file names present on disk, from `GET /timeline/{id}/images`.
   *
   * Checked before an `<img>` is emitted at all, rather than left to fail at load time. The
   * rest of the application already works this way — the layout and the detail panel both
   * resolve a name against this list first — because a broken-image glyph in a frame is
   * worse than nothing, and a name in a narrative goes stale the same way a name on an
   * episode does.
   */
  availableImages: readonly string[];
}

/**
 * Where an image in a narrative is allowed to come from: the timeline's own image folder,
 * by bare file name — `![The house](kalamazoo-house.jpg)`.
 *
 * Anything else returns null and is not loaded. This is not about the picture being unsafe;
 * it is that a remote `src` makes the browser fetch it the moment the narrative is opened,
 * which would be the first outbound request in an application whose whole premise is that
 * nothing leaves the machine — and it would leak *when you read which episode* to whoever
 * serves it. Reusing the image folder also means a picture in a narrative is the same
 * portable file as a picture on an episode, with no second place to put things.
 */
function resolveImageSource(source: string, context: NarrativeContext | undefined): string | null {
  if (!context) return null;

  // "./name.jpg" is the same request as "name.jpg" and is what an editor with a file picker
  // is likely to write.
  const name = source.startsWith('./') ? source.slice(2) : source;

  // Bare names only. A slash means a path, a colon means a scheme, and both are refused
  // rather than resolved — the API would refuse them too, one layer further down.
  if (!name || name.includes('/') || name.includes('\\') || name.includes(':')) return null;

  // A name nobody has put a file behind yet is treated exactly like a name pointing outside
  // the folder: the alt text is shown and nothing is fetched.
  if (!context.availableImages.includes(name)) return null;

  return imageUrl(context.timelineId, name, 'full');
}

md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  // The index always exists; `noUncheckedIndexedAccess` does not know that, and the renderer
  // has nothing sensible to emit for a token that is not there.
  if (!token) return '';

  const resolved = resolveImageSource(
    token.attrGet('src') ?? '',
    env as NarrativeContext | undefined
  );

  // The alt text is what the author wrote about the picture, so it is the honest thing to
  // show when the picture itself is not going to be fetched.
  const alt = self.renderInlineAsText(token.children ?? [], options, env);

  if (!resolved) {
    return alt ? `<span class="narrative-no-image">${md.utils.escapeHtml(alt)}</span>` : '';
  }

  token.attrSet('src', resolved);
  token.attrSet('alt', alt);
  // Below the fold in a long narrative, an image costs nothing until it is scrolled to.
  token.attrSet('loading', 'lazy');

  return self.renderToken(tokens, index, options);
};

// Links open in a new tab so that following one does not throw away the timeline, the zoom
// and the open panel. rel is not optional with target=_blank: without it the opened page
// gets a handle on this one through window.opener.
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index]?.attrSet('target', '_blank');
  tokens[index]?.attrSet('rel', 'noreferrer noopener');
  return self.renderToken(tokens, index, options);
};

/**
 * Renders one narrative to HTML.
 *
 * The context is needed because a bare image name only means something relative to a
 * particular timeline's image folder, and only against a listing of what is in it.
 */
export function renderNarrative(markdown: string, context: NarrativeContext): string {
  return md.render(markdown, context);
}

/**
 * A rough word count, for telling the reader (and the writer) how long a narrative is.
 * Deliberately crude — it is a sense of scale, not a statistic.
 */
export function countWords(markdown: string): number {
  const words = markdown.trim().match(/\S+/g);
  return words ? words.length : 0;
}
