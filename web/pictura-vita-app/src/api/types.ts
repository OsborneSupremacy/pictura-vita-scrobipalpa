/**
 * Wire types, mirroring `Pictura.Vita.Domain`. Serialized camelCase by System.Text.Json.
 */

/** `Pictura.Vita.Domain.Confidentiality` */
export const Confidentiality = {
  Inherit: 0,
  Public: 1,
  Friends: 2,
  OnlyMe: 3
} as const;

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
  death: string;
}

export interface ApiOrganization {
  name: string;
  obfuscateDates: boolean;
  startPrecision: number;
  start: string;
  endPrecision: number;
  end: string;
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
  end: string;
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
