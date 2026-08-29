import { toDayNumber } from '../layout';
import type { LayoutCategory, LayoutEpisode } from '../layout';
import { EpisodeType, type ApiCategory, type ApiEpisode } from './types';

/**
 * Converts wire types into the layout engine's input types. Keeping this boundary explicit
 * is what lets the engine stay a pure function with no knowledge of the transport.
 */

export function toLayoutEpisode(episode: ApiEpisode): LayoutEpisode {
  const start = toDayNumber(episode.start);

  return {
    episodeId: episode.episodeId,
    title: episode.title,
    subtitle: episode.subtitle,
    description: episode.description,
    url: episode.url,
    urlDescription: episode.urlDescription,
    kind: episode.episodeType === EpisodeType.Era ? 'era' : 'incident',
    start,
    // An indefinite episode carries 9999-12-31; the layout substitutes the window's
    // ceiling, so the parsed value is never drawn. Keep `start` as a harmless stand-in
    // rather than a number that would dwarf every real date if it ever leaked through.
    end: episode.indefinite ? start : toDayNumber(episode.end),
    indefinite: episode.indefinite,
    categoryIds: episode.categoryIds
  };
}

export function toLayoutCategory(category: ApiCategory): LayoutCategory {
  return {
    categoryId: category.categoryId,
    title: category.title,
    sortOrder: category.sortOrder
  };
}
