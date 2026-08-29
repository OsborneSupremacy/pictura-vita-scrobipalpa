import { type DayNumber } from './dates';
import type { LayoutEpisode } from './types';

export interface Window {
  floor: DayNumber;
  ceiling: DayNumber;
}

/**
 * Derives the drawn window from the episodes themselves: from the earliest start to the
 * latest end, with anything ongoing pulling the ceiling out to at least `today`.
 *
 * `today` is a parameter rather than a call to the clock so the result is deterministic
 * and testable. An empty set yields a single-day window at `today`.
 */
export function deriveWindow(episodes: LayoutEpisode[], today: DayNumber): Window {
  if (episodes.length === 0) return { floor: today, ceiling: today };

  let floor = Number.POSITIVE_INFINITY;
  let ceiling = Number.NEGATIVE_INFINITY;
  let hasIndefinite = false;

  for (const episode of episodes) {
    if (episode.start < floor) floor = episode.start;

    if (episode.indefinite) {
      hasIndefinite = true;
      continue;
    }

    if (episode.end > ceiling) ceiling = episode.end;
  }

  // Every episode is ongoing, so nothing supplied a real end.
  if (ceiling === Number.NEGATIVE_INFINITY) ceiling = today;
  if (hasIndefinite && ceiling < today) ceiling = today;
  if (ceiling < floor) ceiling = floor;

  return { floor, ceiling };
}
