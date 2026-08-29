import type { ApiEpisode } from '../api/types';

/**
 * What removing categories would cost.
 *
 * Removing a category does not delete its episodes — they stay in the file, still tagged
 * with the id. But the timeline only draws an episode through a category it can resolve,
 * so an episode left with no surviving category disappears from view with no way to reach
 * it in the app. That is the number worth putting in front of someone before they confirm.
 */
export interface RemovalImpact {
  /** Episodes tagged with the category being removed. */
  tagged: number;
  /** Of those, the ones left with no surviving category at all. */
  orphaned: number;
}

export function removalImpact(
  episodes: ApiEpisode[],
  categoryId: string,
  alsoRemoving: ReadonlySet<string> = new Set()
): RemovalImpact {
  const removed = new Set(alsoRemoving);
  removed.add(categoryId);

  let tagged = 0;
  let orphaned = 0;

  for (const episode of episodes) {
    if (!episode.categoryIds.includes(categoryId)) continue;

    tagged += 1;
    if (episode.categoryIds.every(id => removed.has(id))) orphaned += 1;
  }

  return { tagged, orphaned };
}

/** Total episodes that would vanish from the timeline if every pending removal is applied. */
export function totalOrphaned(
  episodes: ApiEpisode[],
  removing: ReadonlySet<string>
): number {
  if (removing.size === 0) return 0;

  return episodes.filter(
    episode =>
      episode.categoryIds.length > 0 && episode.categoryIds.every(id => removing.has(id))
  ).length;
}
