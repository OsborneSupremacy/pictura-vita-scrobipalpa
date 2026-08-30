import { useEffect, useState } from 'react';
import { api } from './api/client';
import type { ApiTimeline, ApiTimelineSummary } from './api/types';
import { toDayNumber } from './layout';
import { TimelineView } from './components/TimelineView';
import { ProfileMenu } from './components/ProfileMenu';
import { TimelineInfoDialog } from './components/TimelineInfoDialog';
import { CategoryDialog } from './components/CategoryDialog';

/**
 * Resolved once per mount so that a long-lived tab does not silently re-lay-out at midnight,
 * and so the layout stays a pure function of its inputs.
 */
const today = toDayNumber(new Date().toISOString().slice(0, 10));

export default function App() {
  const [summaries, setSummaries] = useState<ApiTimelineSummary[]>([]);
  const [timeline, setTimeline] = useState<ApiTimeline | null>(null);
  const [availableImages, setAvailableImages] = useState<readonly string[]>([]);
  const [availableNarratives, setAvailableNarratives] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);

  /**
   * Loads a timeline together with the image and narrative names that exist for it.
   *
   * All three are fetched at once so the first render already knows which side files are
   * real. A failure to list either directory is swallowed on purpose: both are optional
   * extras, and losing the whole timeline because one of them could not be read would be a
   * poor trade.
   */
  const load = async (id: string) => {
    const [loaded, images, narratives] = await Promise.all([
      api.timeline(id),
      api.timelineImages(id).catch(() => [] as string[]),
      api.timelineNarratives(id).catch(() => [] as string[])
    ]);

    setTimeline(loaded);
    setAvailableImages(images);
    setAvailableNarratives(narratives);
  };

  useEffect(() => {
    api
      .timelineSummaries()
      .then(async found => {
        setSummaries(found);
        if (found[0]) await load(found[0].timelineId);
      })
      .catch((problem: unknown) => setError(problem instanceof Error ? problem.message : String(problem)));
  }, []);

  /**
   * An upload adds a file to a directory the client cannot list for itself, so the server's
   * answer is folded into the existing list rather than triggering a refetch of everything.
   */
  const addAvailableImage = (imageName: string) =>
    setAvailableImages(current =>
      current.includes(imageName) ? current : [...current, imageName].sort());

  /** The same fold-in for a narrative written by a save, for the same reason. */
  const addAvailableNarrative = (narrativeName: string) =>
    setAvailableNarratives(current =>
      current.includes(narrativeName) ? current : [...current, narrativeName].sort());

  const select = async (id: string) => {
    setError(null);
    try {
      await load(id);
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  return (
    <main>
      <header className="app-header">
        <h1>Pictura Vita</h1>
        {summaries.length > 1 && (
          <select
            value={timeline?.timelineId ?? ''}
            onChange={event => void select(event.target.value)}
          >
            {summaries.map(summary => (
              <option key={summary.timelineId} value={summary.timelineId}>
                {summary.title}
              </option>
            ))}
          </select>
        )}

        <ProfileMenu today={today} />
      </header>

      {error && (
        <p className="error">
          {error}
          <br />
          <span className="muted">
            This app needs two processes: the API and this dev server.
          </span>
        </p>
      )}

      {timeline && (
        <>
          <p className="timeline-title">
            <strong>{timeline.timelineInfo.title}</strong>
            {timeline.timelineInfo.subtitle && <span className="muted"> — {timeline.timelineInfo.subtitle}</span>}
            <button type="button" className="link" onClick={() => setEditingInfo(true)}>
              Edit timeline info
            </button>
            <button type="button" className="link" onClick={() => setEditingCategories(true)}>
              Categories
            </button>
          </p>

          {editingInfo && (
            <TimelineInfoDialog
              timeline={timeline}
              today={today}
              onSaved={info => {
                setTimeline({ ...timeline, timelineInfo: info });
                setEditingInfo(false);
              }}
              onClose={() => setEditingInfo(false)}
            />
          )}

          {editingCategories && (
            <CategoryDialog
              timeline={timeline}
              // Categories are created server-side with ids we do not know, so refetch
              // rather than trying to reconstruct the collection locally.
              onSaved={() => {
                setEditingCategories(false);
                void select(timeline.timelineId);
              }}
              onClose={() => setEditingCategories(false)}
            />
          )}
          <TimelineView
            timeline={timeline}
            today={today}
            availableImages={availableImages}
            onImageAdded={addAvailableImage}
            availableNarratives={availableNarratives}
            onNarrativeAdded={addAvailableNarrative}
            onChanged={() => void select(timeline.timelineId)}
          />
        </>
      )}
    </main>
  );
}
