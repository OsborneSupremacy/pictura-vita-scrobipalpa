import { buildAxis } from './axis';
import { clamp, daySpan, type DayNumber } from './dates';
import { Confidentiality } from './types';
import type {
  CategoryBand,
  LayoutCategory,
  LayoutEpisode,
  LayoutInput,
  Rail,
  RailKind,
  ResolvedConfidentiality,
  TimeItem,
  TimelineLayout
} from './types';

/** Fixed drawn width of an incident callout. */
export const CALLOUT_WIDTH_PX = 100;

/**
 * An era narrower than this cannot hold a readable label, so it also gets a callout
 * above or below the band pointing at it.
 */
export const SUPPLEMENT_THRESHOLD_PX = 100;

/** An era at or below this width is drawn as a bare stripe with no text at all. */
export const SLIVER_THRESHOLD_PX = 30;

/** Number of category colours defined in the stylesheet. */
export const PALETTE_SIZE = 7;

interface Scale {
  floor: DayNumber;
  ceiling: DayNumber;
  pxPerDay: number;
  /** Day-span equivalent of `CALLOUT_WIDTH_PX`, at least 1. */
  calloutDays: number;
}

const emptyLayout = (
  floor: DayNumber,
  ceiling: DayNumber,
  totalWidth: number
): TimelineLayout => ({
  floor,
  ceiling,
  totalDays: daySpan(floor, ceiling),
  totalWidth,
  axis: [],
  bands: [],
  isEmpty: true
});

/**
 * The level an episode is actually shown at within a given category.
 *
 * An episode set to Inherit takes the category's level, so the *same* episode can be
 * visible in one band and hidden in another. That is why this resolves per
 * (episode, category) pair rather than once per episode.
 */
export function resolveConfidentiality(
  episode: LayoutEpisode,
  category: LayoutCategory
): ResolvedConfidentiality {
  return episode.confidentiality === Confidentiality.Inherit
    ? category.confidentiality
    : (episode.confidentiality as ResolvedConfidentiality);
}

/**
 * Episodes visible at `maxConfidentiality` in at least one of their categories. Used to
 * derive the drawn window, which should reflect what is actually on screen.
 */
export function filterByConfidentiality(
  episodes: LayoutEpisode[],
  categories: LayoutCategory[],
  maxConfidentiality: ResolvedConfidentiality
): LayoutEpisode[] {
  const byId = new Map(categories.map(category => [category.categoryId, category]));

  return episodes.filter(episode =>
    episode.categoryIds.some(categoryId => {
      const category = byId.get(categoryId);
      return category !== undefined
        && resolveConfidentiality(episode, category) <= maxConfidentiality;
    })
  );
}

/** The end a drawn box should use: indefinite episodes run to the window's edge. */
function effectiveEnd(episode: LayoutEpisode, ceiling: DayNumber): DayNumber {
  return episode.indefinite ? ceiling : episode.end;
}

function isVisible(episode: LayoutEpisode, scale: Scale): boolean {
  if (episode.kind === 'incident') {
    return episode.start >= scale.floor && episode.start <= scale.ceiling;
  }
  return episode.start <= scale.ceiling && effectiveEnd(episode, scale.ceiling) >= scale.floor;
}

/** Matches the original's ordering, which the greedy rail packing depends on. */
function compareEpisodes(a: LayoutEpisode, b: LayoutEpisode): number {
  return (
    a.start - b.start ||
    a.end - b.end ||
    a.title.localeCompare(b.title) ||
    a.episodeId.localeCompare(b.episodeId)
  );
}

function buildEraItem(episode: LayoutEpisode, scale: Scale): TimeItem {
  const rawEnd = effectiveEnd(episode, scale.ceiling);
  const start = clamp(episode.start, scale.floor, scale.ceiling);
  const end = clamp(rawEnd, scale.floor, scale.ceiling);
  const width = daySpan(start, end) * scale.pxPerDay;

  return {
    key: `era-${episode.episodeId}`,
    kind: 'era',
    episodeId: episode.episodeId,
    title: episode.title,
    subtitle: episode.subtitle,
    anchor: null,
    anchorOffset: 0,
    start,
    end,
    width,
    fromPast: episode.start < scale.floor,
    intoFuture: episode.indefinite || episode.end > scale.ceiling,
    sliver: width <= SLIVER_THRESHOLD_PX,
    onFloor: false,
    onCeiling: false,
    supplementOf: null,
    targetRailIndex: null,
    reference: false
  };
}

/**
 * Builds the fixed-width box for a moment in time, centred on `anchor` and nudged inside
 * the window when it would overhang either edge.
 */
function buildIncidentItem(
  key: string,
  episode: LayoutEpisode,
  anchor: DayNumber,
  scale: Scale,
  supplementOf: string | null,
  targetRailIndex: number | null
): TimeItem {
  const half = Math.floor(scale.calloutDays / 2);

  let start = anchor - half;
  let end = start + scale.calloutDays - 1;

  let onCeiling = false;
  let onFloor = false;

  if (end > scale.ceiling) {
    onCeiling = true;
    end = scale.ceiling;
    start = end - scale.calloutDays + 1;
  }

  if (start < scale.floor) {
    onFloor = true;
    start = scale.floor;
    end = Math.min(scale.ceiling, start + scale.calloutDays - 1);
  }

  const width = daySpan(start, end) * scale.pxPerDay;

  return {
    key,
    kind: 'incident',
    episodeId: episode.episodeId,
    title: episode.title,
    subtitle: episode.subtitle,
    anchor,
    anchorOffset: Math.min(Math.max((anchor - start) * scale.pxPerDay, 0), width),
    start,
    end,
    width,
    fromPast: false,
    intoFuture: false,
    sliver: false,
    onFloor,
    onCeiling,
    supplementOf,
    targetRailIndex,
    reference: false
  };
}

function buildReferenceItem(category: LayoutCategory, scale: Scale): TimeItem {
  return {
    key: `reference-${category.categoryId}`,
    kind: 'era',
    episodeId: null,
    title: category.title,
    subtitle: '',
    anchor: null,
    anchorOffset: 0,
    start: scale.floor,
    end: scale.ceiling,
    width: daySpan(scale.floor, scale.ceiling) * scale.pxPerDay,
    fromPast: true,
    intoFuture: true,
    sliver: false,
    onFloor: false,
    onCeiling: false,
    supplementOf: null,
    targetRailIndex: null,
    reference: true
  };
}

function placeholder(
  key: string,
  start: DayNumber,
  end: DayNumber,
  scale: Scale
): TimeItem {
  return {
    key,
    kind: 'placeholder',
    episodeId: null,
    title: '',
    subtitle: '',
    anchor: null,
    anchorOffset: 0,
    start,
    end,
    width: daySpan(start, end) * scale.pxPerDay,
    fromPast: false,
    intoFuture: false,
    sliver: false,
    onFloor: false,
    onCeiling: false,
    supplementOf: null,
    targetRailIndex: null,
    reference: false
  };
}

/**
 * Greedy first-fit packing: each item goes on the first rail whose last item ends before it
 * begins, otherwise onto a new rail. Gaps are filled with transparent placeholders, because
 * rails are laid out as a flex row of boxes whose widths sum across the window rather than
 * by absolute positioning.
 */
function packRails(
  items: TimeItem[],
  kind: RailKind,
  scale: Scale,
  keyPrefix: string
): Rail[] {
  const rails: { end: DayNumber; items: TimeItem[] }[] = [];

  for (const item of items) {
    let rail = rails.find(candidate => candidate.end < item.start);

    if (!rail) {
      rail = { end: scale.floor - 1, items: [] };
      rails.push(rail);
    }

    if (item.start > rail.end + 1) {
      rail.items.push(
        placeholder(`${keyPrefix}-gap-${rails.indexOf(rail)}-${rail.end + 1}`, rail.end + 1, item.start - 1, scale)
      );
    }

    rail.items.push(item);
    rail.end = item.end;
  }

  return rails.map((rail, index) => ({
    key: `${keyPrefix}-${index}`,
    kind,
    items: rail.items
  }));
}

function buildBand(
  category: LayoutCategory,
  episodes: LayoutEpisode[],
  scale: Scale,
  colorIndex: number,
  maxConfidentiality: ResolvedConfidentiality
): CategoryBand {
  const visible = episodes
    .filter(episode => resolveConfidentiality(episode, category) <= maxConfidentiality)
    .filter(episode => isVisible(episode, scale))
    .sort(compareEpisodes);

  const eraItems: TimeItem[] = [];
  const incidentItems: TimeItem[] = [];
  const pendingSupplements: { episode: LayoutEpisode; anchor: DayNumber }[] = [];

  for (const episode of visible) {
    if (episode.kind === 'incident') {
      incidentItems.push(
        buildIncidentItem(`incident-${episode.episodeId}`, episode, episode.start, scale, null, null)
      );
      continue;
    }

    const era = buildEraItem(episode, scale);
    eraItems.push(era);

    // Too narrow to read: point at it with a callout instead of relying on the bar itself.
    if (era.width < SUPPLEMENT_THRESHOLD_PX) {
      const midpoint = era.start + Math.floor(daySpan(era.start, era.end) / 2);
      pendingSupplements.push({ episode, anchor: clamp(midpoint, scale.floor, scale.ceiling) });
    }
  }

  // A category of nothing but incidents still needs a bar for its callouts to point at.
  if (eraItems.length === 0 && incidentItems.length > 0) {
    eraItems.push(buildReferenceItem(category, scale));
  }

  // Eras are packed first so each supplement can record which rail its bar ended up on.
  const eraRails = packRails(eraItems, 'era', scale, `${category.categoryId}-era`);

  const eraRailByEpisode = new Map<string, number>();
  eraRails.forEach((rail, index) => {
    for (const item of rail.items) {
      if (item.episodeId !== null) eraRailByEpisode.set(item.episodeId, index);
    }
  });

  for (const { episode, anchor } of pendingSupplements) {
    incidentItems.push(
      buildIncidentItem(
        `supplement-${episode.episodeId}`,
        episode,
        anchor,
        scale,
        episode.episodeId,
        eraRailByEpisode.get(episode.episodeId) ?? null
      )
    );
  }

  incidentItems.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));

  const incidentRails = packRails(incidentItems, 'incident', scale, `${category.categoryId}-incident`);

  return {
    categoryId: category.categoryId,
    title: category.title,
    icon: category.icon,
    colorIndex,
    eraRails,
    // Incident rails alternate above and below the band, as the original did.
    incidentRailsAbove: incidentRails.filter((_, index) => index % 2 === 0),
    incidentRailsBelow: incidentRails.filter((_, index) => index % 2 === 1)
  };
}

/**
 * Lays out a timeline.
 *
 * Pure: given the same input it returns the same output, with no reliance on the DOM, the
 * clock, or the browser's time zone. `totalWidth` is the only measurement the caller supplies.
 */
export function buildLayout(input: LayoutInput): TimelineLayout {
  const { floor, ceiling, totalWidth } = input;

  if (totalWidth <= 0 || ceiling < floor) return emptyLayout(floor, ceiling, totalWidth);

  const totalDays = daySpan(floor, ceiling);
  const pxPerDay = totalWidth / totalDays;

  const scale: Scale = {
    floor,
    ceiling,
    pxPerDay,
    calloutDays: Math.max(1, Math.round(CALLOUT_WIDTH_PX / pxPerDay))
  };

  const byCategory = new Map<string, LayoutEpisode[]>();
  for (const category of input.categories) byCategory.set(category.categoryId, []);

  // An episode belongs to every category it names, so it is drawn once per band. The
  // server sends it a single time; the fan-out happens here.
  for (const episode of input.episodes) {
    for (const categoryId of episode.categoryIds) {
      byCategory.get(categoryId)?.push(episode);
    }
  }

  const bands = [...input.categories]
    .filter(
      category =>
        input.visibleCategoryIds === null || input.visibleCategoryIds.has(category.categoryId)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((category, index) =>
      buildBand(
        category,
        byCategory.get(category.categoryId) ?? [],
        scale,
        index % PALETTE_SIZE,
        input.maxConfidentiality
      )
    )
    .filter(band => band.eraRails.length > 0 || band.incidentRailsAbove.length > 0);

  return {
    floor,
    ceiling,
    totalDays,
    totalWidth,
    axis: buildAxis(floor, ceiling, totalWidth),
    bands,
    isEmpty: bands.length === 0
  };
}
