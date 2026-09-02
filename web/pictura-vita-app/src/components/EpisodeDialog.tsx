import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, fetchNarrative, imageUrl, saveNarrative, uploadImage } from '../api/client';
import { Confidentiality, EpisodeType, type ApiEpisode, type ApiTimeline } from '../api/types';
import { MAX_DATE_ISO, toIso, type DayNumber } from '../layout';
import { countWords, renderNarrative } from '../markdown/narrative';

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
  /** Fired when an upload adds a file, so the owner can keep its list current. */
  onImageAdded: (imageName: string) => void;
  /**
   * Narrative file names present on disk. Offered as suggestions, and used to decide whether
   * a name already has text worth loading into the editor.
   */
  availableNarratives: readonly string[];
  /** Fired when a save writes a new narrative file, so the owner can keep its list current. */
  onNarrativeAdded: (narrativeName: string) => void;
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
  /**
   * File name of the narrative. Held separately from its text: the name is part of the
   * episode and is saved with it, while the text is a file the API writes on its own.
   */
  narrativeName: string;
  /** `EpisodeType.Incident` or `EpisodeType.Era`. An incident holds `end` equal to `start`. */
  episodeType: number;
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
  narrativeName: episode.narrativeName ?? '',
  episodeType: episode.episodeType,
  start: episode.start,
  end: episode.end === MAX_DATE_ISO ? '' : episode.end,
  indefinite: episode.indefinite || episode.end === MAX_DATE_ISO,
  confidentiality: episode.confidentiality,
  categoryIds: [...episode.categoryIds]
});

/** A new episode starts as an incident, today, inheriting its category's visibility. */
const blankDraft = (categoryIds: string[], today: DayNumber): Draft => ({
  title: '',
  subtitle: '',
  description: '',
  url: '',
  urlDescription: '',
  imageName: '',
  narrativeName: '',
  episodeType: EpisodeType.Incident,
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

  if (!trimmed) {
    return {
      text: 'Drop a picture, paste one, or choose a file. Location data is stripped on upload.',
      bad: false
    };
  }

  if (available.includes(trimmed)) return { text: 'Found in your images folder.', bad: false };

  return {
    text: 'No file of that name is in the images folder \u2014 the episode will draw without one.',
    bad: true
  };
}

/**
 * What to say under the narrative editor.
 *
 * Like the image hint, none of this blocks saving. An episode is worth recording whether or
 * not the long version of it has been written yet.
 */
function describeNarrative(
  name: string,
  text: string,
  available: readonly string[]
): { text: string; bad: boolean } {
  const trimmed = name.trim();
  const words = countWords(text);
  const length = words === 1 ? '1 word' : `${words.toLocaleString()} words`;

  if (text.trim()) {
    return trimmed
      ? { text: `${length}, saved to ${trimmed}.`, bad: false }
      : { text: `${length}. A file will be named after the episode's title when you save.`, bad: false };
  }

  if (trimmed && !available.includes(trimmed)) {
    return {
      text: `No file called ${trimmed} is in the narratives folder \u2014 saving will create it.`,
      bad: false
    };
  }

  return {
    text: 'Markdown. Headings, lists, links and pictures from your images folder all work.',
    bad: false
  };
}

function problemWith(draft: Draft): string | null {
  if (!draft.title.trim()) return 'Give the episode a title.';
  if (draft.categoryIds.length === 0) return 'Choose at least one category.';

  // An incident is one day, so its end date is not the user's to give: `start` carries it.
  if (draft.episodeType === EpisodeType.Incident) {
    return draft.start ? null : 'Give the date it happened.';
  }

  if (!draft.start) return 'Give a start date.';
  if (draft.indefinite) return null;
  if (!draft.end) return 'Give an end date, or mark the episode as ongoing.';
  // Equal dates would make it an incident, which is the other choice above rather than a
  // shape an era is allowed to take.
  if (draft.end <= draft.start) return 'An era runs over at least two days — end it after it starts.';
  return null;
}

export function EpisodeDialog({
  timeline,
  mode,
  today,
  availableImages,
  onImageAdded,
  availableNarratives,
  onNarrativeAdded,
  onChanged,
  onClose
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(mode, today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Deleting is irreversible, so it takes a second, deliberate click.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  // The narrative's text is not part of the draft: it is a separate file with its own save
  // call, and only the *name* belongs to the episode. `loadedNarrative` is what came off
  // disk, so the dialog can tell an untouched narrative from an edited one and skip writing
  // a file that has not changed.
  const [narrative, setNarrative] = useState('');
  const [loadedNarrative, setLoadedNarrative] = useState('');
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [narrativeState, setNarrativeState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  /**
   * Sends one picture and points the episode at whatever the server called it.
   *
   * The title seeds the file name, so an episode gets "cornerstone-church-a3f19d.webp"
   * rather than whatever the camera called it. Falls back to the file's own name for an
   * episode being added before it has been titled.
   */
  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);

    try {
      const stem = draft.title.trim() || file.name.replace(/\.[^.]+$/, '');
      const stored = await uploadImage(timeline.timelineId, file, stem);

      setDraft(current => ({ ...current, imageName: stored }));
      // Tell the owner before the hint below is re-evaluated, or a file that was just
      // uploaded reads as missing.
      onImageAdded(stored);
    } catch (problem: unknown) {
      setUploadError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setUploading(false);
    }
  };

  const uploadFirstImage = (files: FileList | null | undefined) => {
    // One image per episode, so extra files in a multi-file drop are ignored rather than
    // silently replacing each other.
    const file = [...(files ?? [])].find(candidate => candidate.type.startsWith('image/'));
    if (file) void upload(file);
  };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    // Pasting is the shortest path from "I copied this picture" to a stored file, and it is
    // also the only one that works for an image copied out of a web page: the bytes come
    // through the clipboard, so nothing has to fetch anything.
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void upload(file);
    };

    element.addEventListener('paste', onPaste);
    return () => element.removeEventListener('paste', onPaste);
  });

  /**
   * Loads the narrative behind whatever name the draft points at.
   *
   * Keyed on the name rather than running once on mount, so picking a different file from
   * the list shows that file. Two guards keep it from destroying work: it does not reload a
   * name it already loaded, and it will not run at all while the editor holds unsaved
   * changes — replacing typed text with the contents of another file is not something
   * choosing a name should silently do. Text typed against one name and then pointed at
   * another is written to the new name on save, which is how a narrative gets renamed.
   */
  useEffect(() => {
    const name = draft.narrativeName.trim();

    // Nothing to load: no name, or a name with no file behind it yet — which is the normal
    // state of a narrative being written for the first time.
    if (!name || !availableNarratives.includes(name)) return;
    if (name === loadedFrom) return;
    if (narrative !== loadedNarrative) return;

    let current = true;
    setNarrativeState('loading');

    fetchNarrative(timeline.timelineId, name)
      .then(text => {
        if (!current) return;
        setNarrative(text ?? '');
        setLoadedNarrative(text ?? '');
        setLoadedFrom(name);
        setNarrativeState('idle');
      })
      .catch(() => {
        if (!current) return;
        // Not an error banner: the episode's other fields are still editable and saveable.
        // What must not happen is writing an empty editor over a file that merely could not
        // be read, and `failed` is what stops the save path from doing that.
        setLoadedFrom(name);
        setNarrativeState('failed');
      });

    return () => {
      current = false;
    };
  }, [
    draft.narrativeName,
    availableNarratives,
    timeline.timelineId,
    loadedFrom,
    narrative,
    loadedNarrative
  ]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingOver(false);
    uploadFirstImage(event.dataTransfer.files);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const isIncident = draft.episodeType === EpisodeType.Incident;

  /**
   * An incident's end date is its start date, so switching between the two types has to
   * move the dates as well as the flag.
   *
   * Coming back the other way the old end date is dropped rather than kept: it was equal to
   * the start while the episode was an incident, and an era wants a later one.
   */
  const setEpisodeType = (episodeType: number) =>
    setDraft(current =>
      episodeType === EpisodeType.Incident
        ? { ...current, episodeType, end: current.start, indefinite: false }
        : { ...current, episodeType, end: current.end > current.start ? current.end : '' }
    );

  /** Keeps an incident's end date on its start date, which is the only place it can be. */
  const setStart = (start: string) =>
    setDraft(current => ({ ...current, start, end: isIncident ? start : current.end }));

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

    // An incident cannot be ongoing and ends the day it starts, whatever the era fields were
    // left holding before the type was switched.
    const indefinite = !isIncident && draft.indefinite;
    const end = isIncident ? draft.start : indefinite ? MAX_DATE_ISO : draft.end;

    const title = draft.title.trim();

    /**
     * Writes the narrative file, if there is one to write, and answers with the name the
     * episode should record.
     *
     * The file goes first because only the server knows what a newly created one is called
     * — the name has to come back before the episode can point at it. If the episode save
     * then fails, the file is left behind unreferenced: a stray .md in a folder, which is
     * the better half of the trade against losing prose that was just typed.
     *
     * Skipped entirely when nothing changed, so opening an episode and pressing Save does
     * not rewrite a file and move its timestamp.
     */
    const resolveNarrativeName = async (): Promise<string> => {
      const name = draft.narrativeName.trim();

      // The file could not be read when the dialog opened, so the editor is empty for a
      // reason that has nothing to do with intent. Keep the reference and leave the file
      // alone rather than overwriting it with that emptiness.
      if (narrativeState === 'failed') return name;

      if (narrative === loadedNarrative) return name;
      // Nothing typed and nothing on disk: no file, no name.
      if (!narrative.trim() && !name) return '';

      const stored = await saveNarrative(timeline.timelineId, name, title, narrative);
      // Tell the owner before anything re-reads the listing, or a file that was just written
      // reads as missing.
      onNarrativeAdded(stored);
      return stored;
    };

    try {
      const narrativeName = await resolveNarrativeName();

      const fields = {
        title,
        subtitle: draft.subtitle,
        description: draft.description,
        url: draft.url,
        urlDescription: draft.urlDescription,
        imageName: draft.imageName.trim(),
        narrativeName,
        start: draft.start,
        end,
        indefinite,
        confidentiality: draft.confidentiality,
        categoryIds: draft.categoryIds
      };

      if (mode.kind === 'add') {
        // episodeType is omitted: the server derives it from the dates, and the dates
        // normalised above are the ones that make it derive the chosen type.
        await api.insertEpisode({
          timelineId: timeline.timelineId,
          startPrecision: 0,
          endPrecision: 0,
          ...fields
        });
      } else {
        await api.updateEpisode({
          timelineId: timeline.timelineId,
          episode: { ...mode.episode, ...fields, episodeType: draft.episodeType }
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
      await api.deleteEpisode(timeline.timelineId, mode.episode.episodeId);
      onChanged();
    } catch (problemDeleting: unknown) {
      setError(problemDeleting instanceof Error ? problemDeleting.message : String(problemDeleting));
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  const sortedCategories = [...timeline.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const imageHint = describeImageName(draft.imageName, availableImages);
  const narrativeHint = describeNarrative(draft.narrativeName, narrative, availableNarratives);

  // Only for a name that actually resolves; a half-typed one would 404 on every keystroke.
  const preview =
    draft.imageName && availableImages.includes(draft.imageName)
      ? imageUrl(timeline.timelineId, draft.imageName, 'thumb')
      : null;

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

          <div className="episode-type" role="radiogroup" aria-label="Episode type">
            <span className="field-label">Type</span>

            <div className="type-options">
              <label>
                <input
                  type="radio"
                  name="episode-type"
                  checked={isIncident}
                  onChange={() => setEpisodeType(EpisodeType.Incident)}
                />
                <span>
                  Incident <em>— happened on one day</em>
                </span>
              </label>

              <label>
                <input
                  type="radio"
                  name="episode-type"
                  checked={!isIncident}
                  onChange={() => setEpisodeType(EpisodeType.Era)}
                />
                <span>
                  Era <em>— ran over two or more days</em>
                </span>
              </label>
            </div>
          </div>

          {isIncident ? (
            <label>
              Date
              <input type="date" value={draft.start} onChange={e => setStart(e.target.value)} />
            </label>
          ) : (
            <>
              <div className="pair">
                <label>
                  Starts
                  <input type="date" value={draft.start} onChange={e => setStart(e.target.value)} />
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
            </>
          )}

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

          <div className="episode-image">
            <span className="field-label">Image</span>

            <div
              className={`image-drop${draggingOver ? ' dragging' : ''}`}
              onDragOver={event => {
                event.preventDefault();
                setDraggingOver(true);
              }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={onDrop}
            >
              {preview && (
                <img
                  className="image-preview"
                  src={preview}
                  alt=""
                  // The file can be deleted from the folder while the dialog is open; an
                  // empty frame is worse than none.
                  onError={event => event.currentTarget.remove()}
                />
              )}

              <div className="image-fields">
                <input
                  value={draft.imageName}
                  list="episode-image-names"
                  placeholder="Drop a picture here, or type a file name"
                  onChange={e => set('imageName', e.target.value)}
                />
                <datalist id="episode-image-names">
                  {availableImages.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <div className="image-actions">
                  <button
                    type="button"
                    onClick={() => filePicker.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : 'Choose file…'}
                  </button>

                  {draft.imageName && !uploading && (
                    <button type="button" className="link" onClick={() => set('imageName', '')}>
                      Remove
                    </button>
                  )}
                </div>

                <input
                  ref={filePicker}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={event => {
                    uploadFirstImage(event.target.files);
                    // Cleared so choosing the same file twice fires a change event again.
                    event.target.value = '';
                  }}
                />
              </div>
            </div>

            <small className={uploadError ?? imageHint.bad ? 'bad' : 'muted'}>
              {uploadError ?? imageHint.text}
            </small>
          </div>

          {/* The long version. Kept below the image because it is the last thing you write
              and the least often filled in — most episodes are a date and a title. */}
          <div className="episode-narrative">
            <div className="narrative-header">
              <span className="field-label">Narrative</span>

              <div className="narrative-tabs" role="tablist" aria-label="Narrative view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!previewing}
                  className={previewing ? '' : 'selected'}
                  onClick={() => setPreviewing(false)}
                >
                  Write
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewing}
                  className={previewing ? 'selected' : ''}
                  onClick={() => setPreviewing(true)}
                >
                  Preview
                </button>
              </div>
            </div>

            {previewing ? (
              narrative.trim() ? (
                // Safe because the renderer never emits HTML from the text: raw HTML is
                // escaped and images are restricted to this timeline's own folder.
                <div
                  className="narrative-body narrative-preview"
                  dangerouslySetInnerHTML={{
                    __html: renderNarrative(narrative, {
                      timelineId: timeline.timelineId,
                      availableImages
                    })
                  }}
                />
              ) : (
                <p className="narrative-preview empty muted">Nothing written yet.</p>
              )
            ) : (
              <textarea
                className="narrative-editor"
                rows={12}
                value={narrative}
                placeholder={
                  narrativeState === 'loading'
                    ? 'Reading…'
                    : 'The long version — what happened, who was there, what it was like.'
                }
                // Read-only rather than editable-and-empty: typing into an editor that failed
                // to load its file, then saving, would overwrite prose that is still there.
                readOnly={narrativeState !== 'idle'}
                onChange={e => setNarrative(e.target.value)}
              />
            )}

            <div className="narrative-file">
              <input
                value={draft.narrativeName}
                list="episode-narrative-names"
                placeholder="File name (chosen for you when you save)"
                onChange={e => set('narrativeName', e.target.value)}
              />
              <datalist id="episode-narrative-names">
                {availableNarratives.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              {draft.narrativeName && (
                <button
                  type="button"
                  className="link"
                  // Unlinks rather than deletes, exactly as removing an image does: the file
                  // stays in the folder, and the episode stops pointing at it.
                  onClick={() => {
                    set('narrativeName', '');
                    setNarrative('');
                    setLoadedNarrative('');
                    setLoadedFrom(null);
                    setNarrativeState('idle');
                  }}
                >
                  Unlink
                </button>
              )}
            </div>

            <small className={narrativeHint.bad ? 'bad' : 'muted'}>
              {narrativeState === 'failed'
                ? `${draft.narrativeName} could not be read, so it is shown empty and will be left alone on save.`
                : narrativeHint.text}
            </small>
          </div>
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
