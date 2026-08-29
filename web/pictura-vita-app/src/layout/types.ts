import type { DayNumber } from './dates';

/**
 * Layout input types.
 *
 * These are deliberately *not* the API's wire types. The engine is a pure function of
 * normalized values so it can be unit tested without a server, a DOM, or a fetch. See
 * `adapter.ts` for the conversion from the API shape.
 */

export type EpisodeKind = 'incident' | 'era';

export interface LayoutEpisode {
  episodeId: string;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  kind: EpisodeKind;
  /** Inclusive. */
  start: DayNumber;
  /** Inclusive. Meaningless when `indefinite`; use the timeline ceiling instead. */
  end: DayNumber;
  indefinite: boolean;
  categoryIds: string[];
}

export interface LayoutCategory {
  categoryId: string;
  title: string;
  sortOrder: number;
}

export interface LayoutInput {
  episodes: LayoutEpisode[];
  categories: LayoutCategory[];
  /** Inclusive lower bound of the drawn window. */
  floor: DayNumber;
  /** Inclusive upper bound of the drawn window. */
  ceiling: DayNumber;
  /** Pixel width the timeline is drawn into. */
  totalWidth: number;
}

/** Layout output types. */

export type AxisGrain = 'month' | 'year' | 'fiveYears' | 'tenYears';

export interface AxisIncrement {
  key: string;
  start: DayNumber;
  /** Inclusive. */
  end: DayNumber;
  grain: AxisGrain;
  label: string;
  longLabel: string;
  width: number;
  onFloor: boolean;
  onCeiling: boolean;
  /** False at the finest grain, where there is nothing further to zoom into. */
  zoomable: boolean;
}

export type TimeItemKind = 'era' | 'incident' | 'placeholder';

export interface TimeItem {
  key: string;
  kind: TimeItemKind;
  /** Null for placeholders. */
  episodeId: string | null;
  title: string;
  subtitle: string;
  /**
   * The point in time an incident marks. Null for eras and placeholders, whose
   * `start`/`end` already describe the real span. A callout's box is wider than the
   * instant it points at, so the two cannot be conflated.
   */
  anchor: DayNumber | null;
  /** Start of the drawn box, clamped to the window. */
  start: DayNumber;
  /** Inclusive end of the drawn box, clamped to the window. */
  end: DayNumber;
  width: number;
  /** The episode began before the window and is drawn clipped on the left. */
  fromPast: boolean;
  /** The episode continues past the window (or is indefinite); clipped on the right. */
  intoFuture: boolean;
  /** Too narrow to carry a label; drawn as a bare stripe. */
  sliver: boolean;
  /** The callout touches the window's lower/upper bound and is nudged inward. */
  onFloor: boolean;
  onCeiling: boolean;
  /**
   * Set on callouts generated automatically for eras too narrow to label. The popover
   * for such a callout describes the era it points at, not a moment in time.
   */
  supplementOf: string | null;
  /** A synthetic full-width era, drawn when a category has incidents but no eras. */
  reference: boolean;
}

export type RailKind = 'era' | 'incident';

export interface Rail {
  key: string;
  kind: RailKind;
  items: TimeItem[];
}

export interface CategoryBand {
  categoryId: string;
  title: string;
  colorIndex: number;
  eraRails: Rail[];
  /** Incident rails drawn above the era rails, arrows pointing down. */
  incidentRailsAbove: Rail[];
  /** Incident rails drawn below the era rails, arrows pointing up. */
  incidentRailsBelow: Rail[];
}

export interface TimelineLayout {
  floor: DayNumber;
  ceiling: DayNumber;
  /** Inclusive day count of the window. */
  totalDays: number;
  totalWidth: number;
  axis: AxisIncrement[];
  bands: CategoryBand[];
  /** True when there is nothing to draw. */
  isEmpty: boolean;
}
