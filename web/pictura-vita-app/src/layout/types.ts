import type { DayNumber } from './dates';

/**
 * Layout input types.
 *
 * These are deliberately *not* the API's wire types. The engine is a pure function of
 * normalized values so it can be unit tested without a server, a DOM, or a fetch. See
 * `adapter.ts` for the conversion from the API shape.
 */

export type EpisodeKind = 'incident' | 'era';

/**
 * Mirrors `Pictura.Vita.Domain.Confidentiality`. Ascending is *more private*, which is the
 * opposite of the original application's Privacy scale — any filter ported from it has to
 * flip its comparison.
 */
export const Confidentiality = {
  Inherit: 0,
  Public: 1,
  Friends: 2,
  OnlyMe: 3
} as const;

export type Confidentiality = (typeof Confidentiality)[keyof typeof Confidentiality];

/** Everything except Inherit: the levels an episode can actually resolve to. */
export type ResolvedConfidentiality = Exclude<Confidentiality, typeof Confidentiality.Inherit>;

export interface LayoutEpisode {
  episodeId: string;
  /** May be Inherit, in which case the category supplies the level. */
  confidentiality: Confidentiality;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  /** File name of the episode's image; empty for none. */
  imageName: string;
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
  /** Paragraph drawn under the band heading; empty for none. */
  description: string;
  /** Icon name to draw beside the band heading; empty for none. */
  icon: string;
  /** Explicit band colour; empty to fall back to `colorIndex`. */
  color: string;
  sortOrder: number;
  /** A category cannot inherit; it is the thing episodes inherit from. */
  confidentiality: ResolvedConfidentiality;
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
  /**
   * The most private level to draw. `OnlyMe` shows everything; `Public` shows only what
   * anyone with the link would see.
   */
  maxConfidentiality: ResolvedConfidentiality;
  /** Categories to draw. Null draws all of them. */
  visibleCategoryIds: ReadonlySet<string> | null;
  /**
   * Image file names known to exist on disk, from `GET /timelines/{id}/images`.
   *
   * Omitting it means none are known, so nothing draws a thumbnail. That is the safe
   * default: a name in the store is a claim about a filesystem this module cannot see, and
   * acting on an unverified one is what produces a broken image and a box that collapses
   * after the fact.
   */
  availableImageNames?: ReadonlySet<string>;
}

/** Layout output types. */

export type AxisGrain =
  | 'month'
  | 'year'
  | 'fiveYears'
  | 'tenYears'
  | 'fiftyYears'
  | 'hundredYears';

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
  /**
   * Pixels from the box's left edge to the anchor date. A callout is centred on its anchor
   * until it is nudged away from an edge of the window, after which the two diverge — this
   * is where a connector must actually be drawn, which the box's midpoint would get wrong.
   * Zero for eras and placeholders.
   */
  anchorOffset: number;
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
  /**
   * Index of the era rail holding the bar this callout points at. Eras are packed onto as
   * many rails as overlap demands, so the bar is not always on the rail nearest the
   * callout; a connector has to cross the rails in between to reach it. Null when there is
   * no specific target (a real incident marks a date, not a span).
   */
  targetRailIndex: number | null;
  /** A synthetic full-width era, drawn when a category has incidents but no eras. */
  reference: boolean;
  /**
   * File name of the thumbnail to draw in this box, or null for none.
   *
   * Non-null only when all three hold: the episode names an image, the name is known to
   * exist, and the box came out wide enough to hold one. Callers can therefore draw it
   * unconditionally — "no image", "missing image" and "too small for an image" have already
   * collapsed into the same null.
   */
  imageName: string | null;
}

export type RailKind = 'era' | 'incident';

export interface Rail {
  key: string;
  kind: RailKind;
  items: TimeItem[];
  /**
   * A full-width bar drawn *behind* this rail's items rather than among them, or null.
   *
   * Set on a rail of nothing but slivers, which carry no label and would otherwise read as
   * loose stripes with nothing joining them. It is outside `items` because the widths in a
   * rail sum across the window: a bar spanning the window cannot also be one of them.
   */
  reference: TimeItem | null;
}

export interface CategoryBand {
  categoryId: string;
  title: string;
  /** Paragraph drawn under the band heading; empty for none. */
  description: string;
  icon: string;
  /** Empty when the category has no colour of its own; use `colorIndex` then. */
  color: string;
  /**
   * Position among the drawn bands, used only when `color` is empty. A category with a
   * colour keeps it wherever it is moved to.
   */
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
