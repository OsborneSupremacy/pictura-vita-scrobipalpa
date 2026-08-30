import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Confidentiality, type ApiEpisode, type ApiTimeline } from '../api/types';
import { MAX_DATE_ISO, toIso, type DayNumber } from '../layout';

/**
 * Adding and editing differ only in where the draft starts and which call saves it, so
 * they share a dialog rather than duplicating every field and its validation.
 */
export type EpisodeDialogMode =
  | { kind: 'edit'; episode: ApiEpisode }
  | { kind: 'add'; categoryIds: string[] };

interface Props {
  timeline: ApiTimeline;
  mode: EpisodeDialogMode;
  /**
   * Image file names present on disk. Offered as suggestions and used to warn about a name
   * that matches nothing — a warning rather than an error, since the file may be dropped in
   * afterwards and the episode is still worth saving either way.
   */
  availableImages: readonly string[];
  today: DayNumber;
  /** Fired after the episode is saved or deleted, so the owner can refetch. */
  onChanged: () => void;
  onClose: () => void;
}

interface Draft {
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  imageName: string;
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

const fromEpisode = (episode: ApiEpisode): Draft => ({
  title: episode.title,
  subtitle: episode.subtitle,
  description: episode.description,
  url: episode.url,
  urlDescription: episode.urlDescription,
  // Null in episodes written before images existed.
  imageName: episode.imageName ?? '',
  start: episode.start,
  end: episode.end === MAX_DATE_ISO ? '' : episode.end,
  indefinite: episode.indefinite || episode.end === MAX_DATE_ISO,
  confidentiality: episode.confidentiality,
  categoryIds: [...episode.categoryIds]
});

/** A new episode starts as a single day, today, inheriting its category's visibility. */
const blankDraft = (categoryIds: string[], today: DayNumber): Draft => ({
  title: '',
  subtitle: '',
  description: '',
  url: '',
  urlDescription: '',
  imageName: '',
  start: toIso(today),
  end: toIso(today),
  indefinite: false,
  confidentiality: Confidentiality.Inherit,
  categoryIds: [...categoryIds]
});

const toDraft = (mode: EpisodeDialogMode, today: DayNumber): Draft =>
  mode.kind === 'edit' ? fromEpisode(mode.episode) : blankDraft(mode.categoryIds, today);

/**
 * What to say under the image field.
 *
 * None of these block saving. A name that matches no file draws as no image, which is the
 * same outcome as leaving the field blank — refusing the save would be a strange way to
 * react to a photo that has not been copied across yet.
 */
function describeImageName(
  name: string,
  available: readonly string[]
): { text: string; bad: boolean } {
  const trimmed = name.trim();

  if (!trimmed) return { text: 'File name only, from your timeline\u2019s images folder.', bad: false };

  if (available.includes(trimmed)) return { text: 'Found.', bad: false };

  return {
    text: 'No file of that name is in the images folder yet \u2014 the episode will draw without one.',
    bad: true
  };
}

function problemWith(draft: Draft): string | null {
  if (!draft.title.trim()) return 'Give the episode a title.';
  if (!draft.start) return 'Give a start date.';
  if (!draft.indefinite && !draft.end) return 'Give an end date, or mark the episode as ongoing.';
  if (!draft.indefinite && draft.end < draft.start) return 'The end date is before the start date.';
  if (draft.categoryIds.length === 0) return 'Choose at least one category.';
  return null;
}

export function EpisodeDialog({
  timeline,
  mode,
  today,
  availableImages,
  onChanged,
  onClose
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(mode, today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Deleting is irreversible, so it takes a second, deliberate click.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

    const fields = {
      title: draft.title.trim(),
      subtitle: draft.subtitle,
      description: draft.description,
      url: draft.url,
      urlDescription: draft.urlDescription,
      imageName: draft.imageName.trim(),
      start: draft.start,
      end: draft.indefinite ? MAX_DATE_ISO : draft.end,
      indefinite: draft.indefinite,
      confidentiality: draft.confidentiality,
      categoryIds: draft.categoryIds
    };

    try {
      if (mode.kind === 'add') {
        // episodeType is omitted: the server derives it from the dates.
        await api.insertEpisode({
          timelineId: timeline.timelineId,
          startPrecision: 0,
          endPrecision: 0,
          ...fields
        });
      } else {
        await api.updateEpisode({
          timelineId: timeline.timelineId,
          episode: { ...mode.episode, ...fields }
        });
      }
      onChanged();
    } catch (problemSaving: unknown) {
      setError(problemSaving instanceof Error ? problemSaving.message : String(problemSaving));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (mode.kind !== 'edit') return;

    setSaving(true);
    setError(null);

    try {
      await api.deleteEpisode(mode.episode.episodeId);
      onChanged();
    } catch (problemDeleting: unknown) {
      setError(problemDeleting instanceof Error ? problemDeleting.message : String(problemDeleting));
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  const sortedCategories = [...timeline.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const imageHint = describeImageName(draft.imageName, availableImages);

  return (
    <dialog ref={dialog} className="info-dialog episode-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>{mode.kind === 'add' ? 'Add episode' : 'Edit episode'}</h2>
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

          <label>
            Image
            <input
              value={draft.imageName}
              list="episode-image-names"
              placeholder="kalamazoo-house.jpg"
              onChange={e => set('imageName', e.target.value)}
            />
            <datalist id="episode-image-names">
              {availableImages.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <small className={imageHint.bad ? 'bad' : 'muted'}>{imageHint.text}</small>
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

        {confirmingDelete && (
          <p className="warn">
            Delete <strong>{mode.kind === 'edit' ? mode.episode.title : ''}</strong> permanently?
            This removes it from the data file. Unlike removing a category, it cannot be undone
            from inside the app — only by restoring an export.
          </p>
        )}

        <footer>
          {mode.kind === 'edit' &&
            (confirmingDelete ? (
              <>
                <button type="button" className="danger" onClick={() => void remove()} disabled={saving}>
                  {saving ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={saving}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="danger-quiet" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            ))}

          <span className="spacer" />

          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {!confirmingDelete && (
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={saving || problem !== null}
              title={problem ?? undefined}
            >
              {saving ? 'Saving…' : mode.kind === 'add' ? 'Add' : 'Save'}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
