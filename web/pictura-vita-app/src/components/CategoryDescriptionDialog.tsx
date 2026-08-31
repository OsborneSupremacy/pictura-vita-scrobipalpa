import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { MAX_CATEGORY_DESCRIPTION, type ApiCategory } from '../api/types';

interface Props {
  timelineId: string;
  category: ApiCategory;
  onSaved: (description: string) => void;
  onClose: () => void;
}

/**
 * Edits one category's description.
 *
 * Deliberately narrow: the bulk CategoryDialog is the place to add, remove and reorder
 * categories, and reaching one description through a list of fifteen rows is worse than a
 * dialog opened from the band it belongs to.
 */
export function CategoryDescriptionDialog({ timelineId, category, onSaved, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(category.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // showModal rather than the open attribute, for the focus trap, backdrop and
  // Escape-to-close that come with it.
  //
  // The textarea is then focused explicitly: showModal gives focus to the first focusable
  // child, which is the close button, and this dialog exists to be typed in. Placing the
  // caret at the end rather than selecting the text means opening it to add a sentence
  // does not risk replacing the paragraph already there.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();

    const input = field.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const remaining = MAX_CATEGORY_DESCRIPTION - text.length;
  const tooLong = remaining < 0;

  const save = async () => {
    if (tooLong) return;

    setSaving(true);
    setError(null);

    const description = text.trim();

    try {
      await api.updateCategory({
        timelineId,
        // An update carries the whole category, so everything not edited here goes back as
        // it arrived. `icon` and `color` are normalised on the way, because files written
        // before those fields existed hold null and the API rejects null for either — four
        // of them would otherwise be uneditable from here.
        category: { ...category, icon: category.icon ?? '', color: category.color ?? '', description }
      });
      onSaved(description);
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} className="info-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>{category.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fields">
          <label>
            Description
            {/* No maxLength: it would silently truncate a long paste, and losing the tail of
                something you wrote is worse than being told it is too long. */}
            <textarea
              ref={field}
              className="category-description-input"
              rows={5}
              value={text}
              placeholder="What this part of the timeline covers."
              onChange={event => setText(event.target.value)}
            />
          </label>

          <p className={tooLong ? 'bad counter' : 'muted counter'} aria-live="polite">
            {tooLong
              ? `${-remaining} over the ${MAX_CATEGORY_DESCRIPTION}-character limit.`
              : `${remaining} characters left.`}
          </p>
        </div>

        {error && <p className="bad">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={saving || tooLong}
            title={tooLong ? `A description is limited to ${MAX_CATEGORY_DESCRIPTION} characters.` : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
