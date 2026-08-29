import type {
  ApiTimeline,
  ApiTimelineSummary,
  InsertCategoryRequest,
  UpdateCategoryRequest,
  UpdateEpisodeRequest,
  UpdateTimelineInfoRequest
} from './types';

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

async function send(method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.ok) return;

  if (response.status === 502) {
    const unreachable = await response.json().catch(() => null);
    if (unreachable?.error === 'api-unreachable') throw new ApiUnreachableError(unreachable.target);
  }

  // FluentValidation failures come back as a ValidationProblemDetails; surface the
  // messages rather than a bare status code, since they say what to fix.
  if (response.status === 400) {
    const problem = await response.json().catch(() => null);
    const errors = problem?.errors as Record<string, string[]> | undefined;
    if (errors) {
      throw new Error(Object.values(errors).flat().join(' '));
    }
  }

  throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}`);
}

export const api = {
  timelineSummaries: () => get<ApiTimelineSummary[]>('/timelinesummaries'),
  timelines: () => get<ApiTimeline[]>('/timelines'),
  timeline: (id: string) => get<ApiTimeline>(`/timeline/${id}`),
  randomTimeline: () => get<ApiTimeline>('/timeline/random'),
  updateTimelineInfo: (request: UpdateTimelineInfoRequest) => send('PUT', '/timeline', request),

  insertCategory: (request: InsertCategoryRequest) => send('POST', '/category', request),
  updateCategory: (request: UpdateCategoryRequest) => send('PUT', '/category', request),
  deleteCategory: (categoryId: string) => send('DELETE', `/category/${categoryId}`),

  updateEpisode: (request: UpdateEpisodeRequest) => send('PUT', '/episode', request)
};
