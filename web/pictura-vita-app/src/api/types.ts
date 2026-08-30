/**
 * Wire types, mirroring `Pictura.Vita.Domain`. Serialized camelCase by System.Text.Json.
 */

// Defined in the layout module, which needs it to resolve inherited levels; re-exported
// here so callers working with wire types have it to hand.
export { Confidentiality } from '../layout';

/** `Pictura.Vita.Domain.EpisodeType` */
export const EpisodeType = {
  Incident: 0,
  Era: 1
} as const;

export const SubjectType = {
  Person: 0,
  Organization: 1
} as const;

export interface ApiCategory {
  categoryId: string;
  title: string;
  subtitle: string;
  confidentiality: number;
  sortOrder: number;
  /** Lucide kebab-case name; empty for none. Null in files written before icons existed. */
  icon: string;
  /** Six-digit hex, or empty to colour the band by its position. */
  color: string;
}

export interface ApiEpisode {
  episodeId: string;
  confidentiality: number;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  /**
   * File name of the episode's image; empty for none. Null in files written before images
   * existed, as with `icon` and `color` on a category.
   *
   * Only the name is stored. Whether a file of that name actually exists is a separate
   * question, answered by `GET /timeline/{id}/images`.
   */
  imageName: string;
  /**
   * File name of the episode's narrative — its long-form Markdown account; empty for none,
   * null in files written before narratives existed.
   *
   * As with `imageName`, only the name is stored. What is in the file, and whether there is
   * a file at all, are separate questions answered by `GET /timeline/{id}/narrative(s)`.
   */
  narrativeName: string;
  episodeType: number;
  startPrecision: number;
  /** yyyy-MM-dd */
  start: string;
  endPrecision: number;
  /** yyyy-MM-dd; 9999-12-31 when indefinite */
  end: string;
  indefinite: boolean;
  categoryIds: string[];
}

export interface ApiPerson {
  nameParts: string[];
  obfuscateDates: boolean;
  birthPrecision: number;
  birth: string;
  deathPrecision: number;
  /** 9999-12-31 when `living`. */
  death: string;
  living: boolean;
}

export interface ApiOrganization {
  name: string;
  obfuscateDates: boolean;
  startPrecision: number;
  start: string;
  endPrecision: number;
  /** 9999-12-31 when `ongoing`. */
  end: string;
  ongoing: boolean;
}

export interface ApiTimelineInfo {
  title: string;
  subtitle: string;
  timelineSubject: {
    subjectType: number;
    organization: ApiOrganization;
    person: ApiPerson;
  };
  start: string;
  /** 9999-12-31 when `ongoing`. */
  end: string;
  ongoing: boolean;
}

export interface ApiTimeline {
  timelineId: string;
  timelineInfo: ApiTimelineInfo;
  episodes: ApiEpisode[];
  categories: ApiCategory[];
}

export interface ApiTimelineSummary {
  timelineId: string;
  title: string;
}

export interface InsertCategoryRequest {
  timelineId: string;
  title: string;
  subtitle: string;
  confidentiality: number;
  sortOrder: number;
  icon: string;
  color: string;
}

export interface UpdateCategoryRequest {
  timelineId: string;
  category: ApiCategory;
}

export interface InsertEpisodeRequest {
  timelineId: string;
  confidentiality: number;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
  imageName: string;
  narrativeName: string;
  startPrecision: number;
  start: string;
  endPrecision: number;
  end: string;
  indefinite: boolean;
  categoryIds: string[];
  /** Deliberately absent: the server derives it from the dates. */
}

export interface UpdateEpisodeRequest {
  timelineId: string;
  episode: ApiEpisode;
}

export interface UpdateTimelineInfoRequest {
  timelineId: string;
  timelineInfo: ApiTimelineInfo;
}
