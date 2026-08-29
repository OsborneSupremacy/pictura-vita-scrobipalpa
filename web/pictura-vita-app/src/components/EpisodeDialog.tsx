import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Confidentiality, type ApiEpisode, type ApiTimeline } from '../api/types';
import { MAX_DATE_ISO } from '../layout';

interface Props {
  timeline: ApiTimeline;
  episode: ApiEpisode;
  onSaved: () => void;
  onClose: () => void;
}

interface Draft {
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  start: string;
  end: string;
  indefinite: boolean;
  confidentiality: number;
  categoryIds: string[];
}

/**
 * An episode may inherit, unlike a category — which is the whole point of Inherit: one
 * episode can be public in an open category and private in a closed one.
 */
const LEVELS = [
  { value: Confidentiality.Inherit, label: 'Inherit from category' },
  { value: Confidentiality.Public, label: 'Public' },
  { value: Confidentiality.Friends, label: 'Friends' },
  { value: Confidentiality.OnlyMe, label: 'Only me' }
];

const toDraft = (episode: ApiEpisode): Draft => ({
  title: episode.title,
  subtitle: episode.subtitle,
  description: episode.description,
  url: episode.url,
  urlDescription: episode.urlDescription,
  start: episode.start,
  end: episode.end === MAX_DATE_ISO ? '' : episode.end,
  indefinite: episode.indefinite || episode.end === MAX_DATE_ISO,
  confidentiality: episode.confidentiality,
  categoryIds: [...episode.categoryIds]
});

function problemWith(draft: Draft): string | null {
  if (!draft.title.trim()) return 'Give the episode a title.';
  if (!draft.start) return 'Give a start date.';
  if (!draft.indefinite && !draft.end) return 'Give an end date, or mark the episode as ongoing.';
  if (!draft.indefinite && draft.end < draft.start) return 'The end date is before the start date.';
  if (draft.categoryIds.length === 0) return 'Choose at least one category.';
  return null;
}

export function EpisodeDialog({ timeline, episode, onSaved, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(episode));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const toggleCategory = (categoryId: string) =>
    setDraft(current => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter(id => id !== categoryId)
        : [...current.categoryIds, categoryId]
    }));

  const problem = problemWith(draft);

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.updateEpisode({
        timelineId: timeline.timelineId,
        episode: {
          ...episode,
          title: draft.title.trim(),
          subtitle: draft.subtitle,
          description: draft.description,
          url: draft.url,
          urlDescription: draft.urlDescription,
          start: draft.start,
          end: draft.indefinite ? MAX_DATE_ISO : draft.end,
          indefinite: draft.indefinite,
          confidentiality: draft.confidentiality,
          categoryIds: draft.categoryIds
        }
      });
      onSaved();
    } catch (problemSaving: unknown) {
      setError(problemSaving instanceof Error ? problemSaving.message : String(problemSaving));
      setSaving(false);
    }
  };

  const sortedCategories = [...timeline.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <dialog ref={dialog} className="info-dialog episode-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>Edit episode</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fields">
          <label>
            Title
            <input value={draft.title} onChange={e => set('title', e.target.value)} />
          </label>

          <label>
            Subtitle
            <input value={draft.subtitle} onChange={e => set('subtitle', e.target.value)} />
          </label>

          <label>
            Description
            <textarea
              rows={3}
              value={draft.description}
              onChange={e => set('description', e.target.value)}
            />
          </label>

          <div className="pair">
            <label>
              Starts
              <input type="date" value={draft.start} onChange={e => set('start', e.target.value)} />
            </label>

            <label>
              Ends
              <input
                type="date"
                value={draft.end}
                disabled={draft.indefinite}
                onChange={e => set('end', e.target.value)}
              />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.indefinite}
              onChange={e => set('indefinite', e.target.checked)}
            />
            Ongoing (no end date yet)
          </label>

          <label>
            Visible to
            <select
              value={draft.confidentiality}
              onChange={e => set('confidentiality', Number(e.target.value))}
            >
              {LEVELS.map(level => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Link
            <input
              value={draft.url}
              placeholder="https://…"
              onChange={e => set('url', e.target.value)}
            />
          </label>

          <label>
            Link text
            <input
              value={draft.urlDescription}
              onChange={e => set('urlDescription', e.target.value)}
            />
          </label>
        </div>

        <fieldset className="episode-categories">
          <legend>Categories</legend>
          {sortedCategories.map(category => (
            <label key={category.categoryId}>
              <input
                type="checkbox"
                checked={draft.categoryIds.includes(category.categoryId)}
                onChange={() => toggleCategory(category.categoryId)}
              />
              {category.title}
            </label>
          ))}
        </fieldset>

        {(error ?? problem) && <p className="bad">{error ?? problem}</p>}

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={saving || problem !== null}
            title={problem ?? undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
