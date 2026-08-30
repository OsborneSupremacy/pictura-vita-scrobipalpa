import type {
  ApiTimeline,
  ApiTimelineSummary,
  InsertCategoryRequest,
  InsertEpisodeRequest,
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

/**
 * URL of an episode's image.
 *
 * `thumb` is generated and cached by the API; `full` is the original file untouched. A name
 * that resolves to nothing answers 404, but callers should already know what exists from
 * `timelineImages` rather than relying on that.
 */
export function imageUrl(timelineId: string, name: string, size: 'thumb' | 'full'): string {
  return (
    `${baseUrl}/timeline/${timelineId}/image/${encodeURIComponent(name)}` +
    (size === 'thumb' ? '?size=thumb' : '')
  );
}

/**
 * Uploads a picture and returns the file name the timeline should record.
 *
 * The name comes back from the server rather than being chosen here: the API decodes and
 * re-encodes the image (which is what strips EXIF, GPS included) and names the file after
 * its content, so only the server knows what the stored file ends up being called.
 *
 * `stem` seeds the readable half of that name — the episode title makes a far better file
 * name than "IMG_4471".
 */
export async function uploadImage(timelineId: string, file: File, stem: string): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('stem', stem);

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/timeline/${timelineId}/image`, { method: 'POST', body });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.ok) {
    const created = (await response.json()) as { imageName: string };
    return created.imageName;
  }

  // 413 comes from the server's outer body limit and carries no body of its own, so it needs
  // a message written here; everything else explains itself.
  if (response.status === 413) throw new Error('That image is far too large to upload.');

  const problem = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(problem?.error ?? `Upload failed: ${response.status} ${response.statusText}`);
}

export const api = {
  timelineSummaries: () => get<ApiTimelineSummary[]>('/timelinesummaries'),
  timelines: () => get<ApiTimeline[]>('/timelines'),
  timeline: (id: string) => get<ApiTimeline>(`/timeline/${id}`),
  randomTimeline: () => get<ApiTimeline>('/timeline/random'),
  /**
   * The image file names actually present on disk for a timeline.
   *
   * Fetched alongside the timeline so the renderer knows what exists before it lays anything
   * out: discovering a missing image from a 404 mid-render means a flash of broken image and
   * a box that collapses afterwards.
   */
  timelineImages: (id: string) => get<string[]>(`/timeline/${id}/images`),
  updateTimelineInfo: (request: UpdateTimelineInfoRequest) => send('PUT', '/timeline', request),

  insertCategory: (request: InsertCategoryRequest) => send('POST', '/category', request),
  updateCategory: (request: UpdateCategoryRequest) => send('PUT', '/category', request),
  deleteCategory: (categoryId: string) => send('DELETE', `/category/${categoryId}`),

  insertEpisode: (request: InsertEpisodeRequest) => send('POST', '/episode', request),
  updateEpisode: (request: UpdateEpisodeRequest) => send('PUT', '/episode', request),
  deleteEpisode: (episodeId: string) => send('DELETE', `/episode/${episodeId}`)
};
