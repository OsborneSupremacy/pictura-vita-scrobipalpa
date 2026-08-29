import type { ApiTimeline, ApiTimelineSummary } from './types';

// Defaults to the dev-server proxy (see vite.config.ts) so the browser stays same-origin.
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

/** Thrown when the API cannot be reached at all, as opposed to answering with an error. */
export class ApiUnreachableError extends Error {
  constructor(readonly target?: string) {
    super(
      `Cannot reach the Pictura Vita API${target ? ` at ${target}` : ''}. ` +
        'Start it with: dotnet run --project src/Pictura.Vita.Api'
    );
    this.name = 'ApiUnreachableError';
  }
}

async function get<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`);
  } catch {
    // fetch only rejects on a network-level failure, which here means nothing answered.
    throw new ApiUnreachableError();
  }

  if (!response.ok) {
    // The dev-server proxy reports an unreachable upstream as a 502 it generates itself.
    if (response.status === 502) {
      const body = await response.json().catch(() => null);
      if (body?.error === 'api-unreachable') throw new ApiUnreachableError(body.target);
    }

    throw new Error(`GET ${path} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  timelineSummaries: () => get<ApiTimelineSummary[]>('/timelinesummaries'),
  timelines: () => get<ApiTimeline[]>('/timelines'),
  timeline: (id: string) => get<ApiTimeline>(`/timeline/${id}`),
  randomTimeline: () => get<ApiTimeline>('/timeline/random')
};
