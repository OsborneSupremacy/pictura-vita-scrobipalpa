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
}

export interface ApiEpisode {
  episodeId: string;
  confidentiality: number;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  urlDescription: string;
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

export interface UpdateTimelineInfoRequest {
  timelineId: string;
  timelineInfo: ApiTimelineInfo;
}
