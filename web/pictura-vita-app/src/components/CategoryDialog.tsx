import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { Confidentiality, type ApiCategory, type ApiTimeline } from '../api/types';
import { removalImpact, totalOrphaned } from './categoryImpact';

interface Props {
  timeline: ApiTimeline;
  onSaved: () => void;
  onClose: () => void;
}

interface Row {
  /** Empty for a category that has not been created yet. */
  categoryId: string;
  title: string;
  subtitle: string;
  confidentiality: number;
  sortOrder: number;
  isNew: boolean;
}

const LEVELS = [
  { value: Confidentiality.Public, label: 'Public' },
  { value: Confidentiality.Friends, label: 'Friends' },
  { value: Confidentiality.OnlyMe, label: 'Only me' }
];

const toRow = (category: ApiCategory): Row => ({ ...category, isNew: false });

/**
 * Changes are staged rather than applied as they are typed.
 *
 * Removing a category takes episodes off the timeline, so it needs a step where the
 * consequence is visible and the decision is still reversible. Applying everything on
 * Save gives that, and keeps a half-finished edit from reaching the file.
 */
export function CategoryDialog({ timeline, onSaved, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    [...timeline.categories].sort((a, b) => a.sortOrder - b.sortOrder).map(toRow)
  );
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const original = useMemo(
    () => new Map(timeline.categories.map(category => [category.categoryId, category])),
    [timeline]
  );

  const set = (index: number, patch: Partial<Row>) =>
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows(current => [
      ...current,
      {
        categoryId: '',
        title: '',
        subtitle: '',
        confidentiality: Confidentiality.OnlyMe,
        sortOrder: current.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
        isNew: true
      }
    ]);

  const toggleRemoval = (categoryId: string) =>
    setRemoving(current => {
      const next = new Set(current);
      if (!next.delete(categoryId)) next.add(categoryId);
      return next;
    });

  const dropNewRow = (index: number) => setRows(current => current.filter((_, i) => i !== index));

  const blank = rows.some(row => !removing.has(row.categoryId) && !row.title.trim());
  const orphaned = totalOrphaned(timeline.episodes, removing);

  const save = async () => {
    if (blank) {
      setError('Every category needs a name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      for (const row of rows) {
        if (row.isNew) {
          await api.insertCategory({
            timelineId: timeline.timelineId,
            title: row.title.trim(),
            subtitle: row.subtitle,
            confidentiality: row.confidentiality,
            sortOrder: row.sortOrder
          });
          continue;
        }

        if (removing.has(row.categoryId)) continue;

        const before = original.get(row.categoryId);
        const changed =
          before &&
          (before.title !== row.title.trim() ||
            before.subtitle !== row.subtitle ||
            before.confidentiality !== row.confidentiality ||
            before.sortOrder !== row.sortOrder);

        if (changed) {
          await api.updateCategory({
            timelineId: timeline.timelineId,
            category: {
              categoryId: row.categoryId,
              title: row.title.trim(),
              subtitle: row.subtitle,
              confidentiality: row.confidentiality,
              sortOrder: row.sortOrder
            }
          });
        }
      }

      // Removals last, so a failure earlier leaves the categories still standing.
      for (const categoryId of removing) await api.deleteCategory(categoryId);

      onSaved();
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} className="info-dialog category-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={event => event.preventDefault()}>
        <header>
          <h2>Categories</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <ul className="category-rows">
          {rows.map((row, index) => {
            const marked = removing.has(row.categoryId);
            const impact = marked
              ? removalImpact(
                  timeline.episodes,
                  row.categoryId,
                  new Set([...removing].filter(id => id !== row.categoryId))
                )
              : null;

            return (
              <li key={row.categoryId || `new-${index}`} className={marked ? 'marked' : ''}>
                <div className="category-row">
                  <input
                    value={row.title}
                    placeholder="Category name"
                    disabled={marked}
                    onChange={e => set(index, { title: e.target.value })}
                  />

                  <select
                    value={row.confidentiality}
                    disabled={marked}
                    onChange={e => set(index, { confidentiality: Number(e.target.value) })}
                  >
                    {LEVELS.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>

                  {row.isNew ? (
                    <button type="button" onClick={() => dropNewRow(index)} title="Discard">
                      ×
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={marked ? 'undo' : ''}
                      onClick={() => toggleRemoval(row.categoryId)}
                      title={marked ? 'Keep this category' : 'Remove this category'}
                    >
                      {marked ? 'Undo' : 'Remove'}
                    </button>
                  )}
                </div>

                {impact && (
                  <p className="removal-note">
                    {impact.tagged === 0
                      ? 'Nothing is tagged with this category.'
                      : impact.orphaned === 0
                        ? `${impact.tagged} ${impact.tagged === 1 ? 'episode is' : 'episodes are'} tagged with this, and all of them are in another category too, so nothing disappears.`
                        : `${impact.tagged} ${impact.tagged === 1 ? 'episode is' : 'episodes are'} tagged with this. ${impact.orphaned} ${impact.orphaned === 1 ? 'has' : 'have'} no other category and will disappear from the timeline.`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <button type="button" className="link" onClick={addRow}>
          Add a category
        </button>

        {orphaned > 0 && (
          <p className="warn">
            {orphaned} {orphaned === 1 ? 'episode' : 'episodes'} will no longer appear anywhere
            on the timeline. {orphaned === 1 ? 'It stays' : 'They stay'} in the data file and can
            be brought back by recreating the category, but there is no way to see{' '}
            {orphaned === 1 ? 'it' : 'them'} in the app until then.
          </p>
        )}

        {error && <p className="bad">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={saving || blank}
            title={blank ? 'Every category needs a name.' : undefined}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
