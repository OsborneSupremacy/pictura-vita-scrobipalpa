import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import { Confidentiality, type ApiCategory, type ApiTimeline } from '../api/types';
import { removalImpact, totalOrphaned } from './categoryImpact';
import { IconPicker } from './IconPicker';
import { ColorPicker } from './ColorPicker';
import { fallbackColor } from '../color/palette';

interface Props {
  timeline: ApiTimeline;
  onSaved: () => void;
  onClose: () => void;
}

interface Row {
  /** Stable across reordering, so React keeps inputs attached to their own row. */
  key: string;
  /** Empty for a category that has not been created yet. */
  categoryId: string;
  title: string;
  subtitle: string;
  /**
   * Not edited here — it has its own dialog, opened from the band heading. It is still
   * carried through every save, because an update sends the whole category and leaving it
   * out would blank the description of every category on the timeline.
   */
  description: string;
  confidentiality: number;
  sortOrder: number;
  icon: string;
  color: string;
  isNew: boolean;
}

const LEVELS = [
  { value: Confidentiality.Public, label: 'Public' },
  { value: Confidentiality.Friends, label: 'Friends' },
  { value: Confidentiality.OnlyMe, label: 'Only me' }
];

const toRow = (category: ApiCategory): Row => ({
  ...category,
  // Null in files written before these existed.
  icon: category.icon ?? '',
  color: category.color ?? '',
  key: category.categoryId,
  isNew: false
});

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
        key: `new-${crypto.randomUUID()}`,
        categoryId: '',
        title: '',
        subtitle: '',
        description: '',
        confidentiality: Confidentiality.OnlyMe,
        // Superseded on save by the row's position; only a placeholder until then.
        sortOrder: current.length,
        icon: '',
        color: '',
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

  /**
   * Order is expressed by position in this list; the stored sortOrder is recomputed from it
   * on save. That keeps the numbers contiguous instead of leaving gaps behind every
   * removal, and means a move is just a swap rather than arithmetic on two records.
   */
  const move = (index: number, direction: -1 | 1) =>
    setRows(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      const moved = next[index];
      const displaced = next[target];
      if (!moved || !displaced) return current;

      next[index] = displaced;
      next[target] = moved;
      return next;
    });

  const blank = rows.some(row => !removing.has(row.categoryId) && !row.title.trim());
  const orphaned = totalOrphaned(timeline.episodes, removing);

  const save = async () => {
    if (blank) {
      setError('Every category needs a name.');
      return;
    }

    setSaving(true);
    setError(null);

    // Numbering runs over the rows that will survive, so removing one closes the gap it
    // leaves rather than stranding an unused value.
    const surviving = rows.filter(row => row.isNew || !removing.has(row.categoryId));

    try {
      for (const [sortOrder, row] of surviving.entries()) {
        if (row.isNew) {
          await api.insertCategory({
            timelineId: timeline.timelineId,
            title: row.title.trim(),
            subtitle: row.subtitle,
            description: row.description,
            confidentiality: row.confidentiality,
            sortOrder,
            icon: row.icon,
            color: row.color
          });
          continue;
        }

        const before = original.get(row.categoryId);
        const changed =
          before &&
          (before.title !== row.title.trim() ||
            before.subtitle !== row.subtitle ||
            before.description !== row.description ||
            before.confidentiality !== row.confidentiality ||
            (before.icon ?? '') !== row.icon ||
            (before.color ?? '') !== row.color ||
            before.sortOrder !== sortOrder);

        if (changed) {
          await api.updateCategory({
            timelineId: timeline.timelineId,
            category: {
              categoryId: row.categoryId,
              title: row.title.trim(),
              subtitle: row.subtitle,
              description: row.description,
              confidentiality: row.confidentiality,
              sortOrder,
              icon: row.icon,
              color: row.color
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
              <li key={row.key} className={marked ? 'marked' : ''}>
                <div className="category-row">
                  <span className="reorder">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || marked}
                      title="Move up"
                      aria-label={`Move ${row.title || 'this category'} up`}
                    >
                      <ChevronUp size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1 || marked}
                      title="Move down"
                      aria-label={`Move ${row.title || 'this category'} down`}
                    >
                      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </span>

                  <IconPicker
                    value={row.icon}
                    disabled={marked}
                    onChange={icon => set(index, { icon })}
                  />

                  <ColorPicker
                    value={row.color}
                    fallback={fallbackColor(index)}
                    disabled={marked}
                    onChange={color => set(index, { color })}
                  />

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
