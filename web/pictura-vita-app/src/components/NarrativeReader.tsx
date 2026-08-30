import { useEffect, useMemo, useState } from 'react';
import { fetchNarrative } from '../api/client';
import { renderNarrative } from '../markdown/narrative';

interface Props {
  timelineId: string;
  /** File name of the narrative to read. Known to exist; see `TimelineView`. */
  narrativeName: string;
  /** The episode's title, shown as the heading so the reader knows what they opened. */
  title: string;
  /** Image file names present on disk, so a picture in the text is only drawn if it is there. */
  availableImages: readonly string[];
  onClose: () => void;
}

/**
 * A full-screen reader for an episode's narrative.
 *
 * An overlay rather than more content inside the detail panel, because the two want opposite
 * things: the panel is a small box pinned to a bar on the timeline, and long prose needs a
 * comfortable measure and somewhere to scroll. The pattern — and the dismissal behaviour —
 * is the one the full-size image view already uses.
 *
 * The text is fetched when this opens rather than with the timeline. A timeline can hold
 * hundreds of episodes and a narrative can run to thousands of words; loading every one to
 * show a button would be paying the whole cost for the one the reader actually opens.
 */
export function NarrativeReader({
  timelineId,
  narrativeName,
  title,
  availableImages,
  onClose
}: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;

    fetchNarrative(timelineId, narrativeName)
      .then(text => {
        if (!current) return;
        // Null is a 404, which by this point means the file went away between the listing
        // and the click. Saying so is better than an empty sheet that looks like a bug.
        setMarkdown(text);
        if (text === null) setError(`${narrativeName} is no longer in the narratives folder.`);
      })
      .catch((problem: unknown) => {
        if (!current) return;
        setError(problem instanceof Error ? problem.message : String(problem));
      });

    // The overlay can be closed before a slow read finishes — an iCloud-evicted file has to
    // be fetched back before it can be served.
    return () => {
      current = false;
    };
  }, [timelineId, narrativeName]);

  // Rendering is pure, so it is memoised on the text rather than repeated on every render
  // caused by something else on the page.
  const html = useMemo(
    () => (markdown === null ? null : renderNarrative(markdown, { timelineId, availableImages })),
    [markdown, timelineId, availableImages]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="narrative-overlay"
      role="presentation"
      // Clicking the backdrop closes, as in the image lightbox. Stopped here rather than
      // allowed to reach the document, where the detail panel's own outside-click handler
      // would close the panel this was opened from.
      onPointerDown={event => {
        event.stopPropagation();
        onClose();
      }}
    >
      <article
        className="narrative-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Selecting a passage is the most likely thing to do in here, and a drag that starts
        // on the text must not be read as a click on the backdrop.
        onPointerDown={event => event.stopPropagation()}
      >
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? (
          <p className="bad">{error}</p>
        ) : html === null ? (
          <p className="muted">Reading…</p>
        ) : (
          // Safe because the renderer never emits HTML from the file: raw HTML is escaped
          // and images are restricted to the timeline's own folder. See markdown/narrative.ts.
          <div className="narrative-body" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </article>
    </div>
  );
}
