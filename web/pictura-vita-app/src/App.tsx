import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { ApiTimeline, ApiTimelineSummary } from './api/types';
import { toDayNumber } from './layout';
import { useHashRoute } from './hooks/useHashRoute';
import { TimelineIndex } from './components/TimelineIndex';
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
  const [route, navigate] = useHashRoute();

  const [summaries, setSummaries] = useState<ApiTimelineSummary[]>([]);
  const [timeline, setTimeline] = useState<ApiTimeline | null>(null);
  const [availableImages, setAvailableImages] = useState<readonly string[]>([]);
  const [availableNarratives, setAvailableNarratives] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);

  /**
   * Loads a timeline together with the image and narrative names that exist for it.
   *
   * All three are fetched at once so the first render already knows which side files are
   * real. A failure to list either directory is swallowed on purpose: both are optional
   * extras, and losing the whole timeline because one of them could not be read would be a
   * poor trade.
   */
  const load = useCallback(async (id: string) => {
    const [loaded, images, narratives] = await Promise.all([
      api.timeline(id),
      api.timelineImages(id).catch(() => [] as string[]),
      api.timelineNarratives(id).catch(() => [] as string[])
    ]);

    setTimeline(loaded);
    setAvailableImages(images);
    setAvailableNarratives(narratives);
  }, []);

  // Fetched each time the index is shown rather than once at start-up, so a title edited
  // inside a timeline is right when you come back out, and a folder dropped into the
  // timelines directory appears without a reload. It costs one request over summaries the
  // server already has cached against each file's timestamp.
  useEffect(() => {
    if (route.kind !== 'index') return;

    api
      .timelines()
      .then(setSummaries)
      .catch((problem: unknown) =>
        setError(problem instanceof Error ? problem.message : String(problem)));
  }, [route.kind]);

  // The URL decides which timeline is open, so a reload, a bookmark and the back button all
  // land in the same place. Nothing is loaded until a timeline is actually asked for — the
  // index page costs one request, not one per timeline.
  useEffect(() => {
    if (route.kind === 'index') {
      setTimeline(null);
      return;
    }

    // Not `timeline?.timelineId === route.timelineId`: the id is what identifies the request,
    // and re-running the effect on a reload of the same timeline is the point of `reload`.
    setError(null);

    load(route.timelineId).catch((problem: unknown) =>
      setError(problem instanceof Error ? problem.message : String(problem)));
  }, [route, load]);

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

  /** Re-reads the open timeline after a change the client cannot reconstruct locally. */
  const reload = (id: string) =>
    load(id).catch((problem: unknown) =>
      setError(problem instanceof Error ? problem.message : String(problem)));

  return (
    <main>
      <header className="app-header">
        <h1>
          {route.kind === 'index' ? (
            'Pictura Vita'
          ) : (
            <a
              href="#/"
              onClick={event => {
                event.preventDefault();
                navigate({ kind: 'index' });
              }}
            >
              Pictura Vita
            </a>
          )}
        </h1>

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

      {route.kind === 'index' && !error && (
        <TimelineIndex summaries={summaries} today={today} onCreate={() => setCreating(true)} />
      )}

      {creating && (
        <TimelineInfoDialog
          mode={{ kind: 'create' }}
          today={today}
          // Straight into the new timeline: it is empty, and the next thing anyone wants is
          // to put a category in it.
          onSaved={(_info, created) => {
            setCreating(false);
            if (created) navigate({ kind: 'timeline', timelineId: created.timelineId });
          }}
          onClose={() => setCreating(false)}
        />
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
              mode={{ kind: 'edit', timeline }}
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
                void reload(timeline.timelineId);
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
            onChanged={() => void reload(timeline.timelineId)}
          />
        </>
      )}
    </main>
  );
}
