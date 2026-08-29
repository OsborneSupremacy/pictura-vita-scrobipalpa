import { Confidentiality, type LayoutCategory, type ResolvedConfidentiality } from '../layout';

interface Props {
  categories: LayoutCategory[];
  hiddenCategoryIds: ReadonlySet<string>;
  onToggleCategory: (categoryId: string) => void;
  onSetAllCategories: (visible: boolean) => void;
  maxConfidentiality: ResolvedConfidentiality;
  onConfidentialityChange: (level: ResolvedConfidentiality) => void;
}

/**
 * Framed as an audience rather than as a level, because that is the question actually being
 * asked: what would this person see? Note the scale runs the opposite way to the original
 * application's, where a higher number meant more public.
 */
const AUDIENCES: { level: ResolvedConfidentiality; label: string; hint: string }[] = [
  { level: Confidentiality.OnlyMe, label: 'Everything', hint: 'Every episode, however private' },
  { level: Confidentiality.Friends, label: 'Friends', hint: 'What someone you share with would see' },
  { level: Confidentiality.Public, label: 'Public', hint: 'What anyone with the link would see' }
];

export function FilterControls({
  categories,
  hiddenCategoryIds,
  onToggleCategory,
  onSetAllCategories,
  maxConfidentiality,
  onConfidentialityChange
}: Props) {
  const shown = categories.length - hiddenCategoryIds.size;
  const audience = AUDIENCES.find(a => a.level === maxConfidentiality);

  return (
    <>
      {/* <details> gives a disclosure that closes on its own, with no outside-click
          handling and no focus trapping to get wrong. */}
      <details className="filter">
        <summary>
          Categories
          <span className="muted">
            {' '}
            {shown} of {categories.length}
          </span>
        </summary>

        <div className="filter-panel">
          <div className="filter-actions">
            <button type="button" onClick={() => onSetAllCategories(true)}>
              Select all
            </button>
            <button type="button" onClick={() => onSetAllCategories(false)}>
              Select none
            </button>
          </div>

          <ul>
            {categories.map(category => (
              <li key={category.categoryId}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hiddenCategoryIds.has(category.categoryId)}
                    onChange={() => onToggleCategory(category.categoryId)}
                  />
                  {category.title}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <label className="filter-audience" title={audience?.hint}>
        Show
        <select
          value={maxConfidentiality}
          onChange={event =>
            onConfidentialityChange(Number(event.target.value) as ResolvedConfidentiality)
          }
        >
          {AUDIENCES.map(option => (
            <option key={option.level} value={option.level} title={option.hint}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
