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
  const [error, setError] = useState<string | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);

  useEffect(() => {
    api
      .timelineSummaries()
      .then(async found => {
        setSummaries(found);
        if (found[0]) setTimeline(await api.timeline(found[0].timelineId));
      })
      .catch((problem: unknown) => setError(problem instanceof Error ? problem.message : String(problem)));
  }, []);

  const select = async (id: string) => {
    setError(null);
    try {
      setTimeline(await api.timeline(id));
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
            onChanged={() => void select(timeline.timelineId)}
          />
        </>
      )}
    </main>
  );
}
