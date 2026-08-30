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

/**
 * Fetches an episode's narrative as Markdown.
 *
 * Not `get<T>` above: the response is text/markdown, not JSON. Returns null for a 404, which
 * is every way the file can fail to be there — a name pointing at nothing, a file deleted
 * since the listing was taken, or one iCloud cannot fetch back right now. The reader treats
 * all three the same: there is nothing to read.
 */
export async function fetchNarrative(timelineId: string, name: string): Promise<string | null> {
  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}/timeline/${timelineId}/narrative/${encodeURIComponent(name)}`
    );
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${name}: ${response.status} ${response.statusText}`);

  return response.text();
}

/**
 * Writes an episode's narrative and returns the file name it was stored under.
 *
 * `name` is the file the episode already points at, or empty for one that has none — the
 * server generates a name from `stem` (the episode title) in that case. The name comes back
 * either way, because only the server knows what a generated one ended up being once
 * collisions with existing files are resolved.
 */
export async function saveNarrative(
  timelineId: string,
  name: string,
  stem: string,
  text: string
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/timeline/${timelineId}/narrative`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stem, text })
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.ok) {
    const saved = (await response.json()) as { narrativeName: string };
    return saved.narrativeName;
  }

  const problem = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(problem?.error ?? `Could not save the narrative: ${response.status} ${response.statusText}`);
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
  /**
   * The narrative file names present on disk for a timeline.
   *
   * Fetched alongside the timeline for the same reason as the image listing: the detail
   * panel has to decide whether to offer "Read narrative" before it draws, and a button
   * that turns out to open nothing is worse than no button.
   */
  timelineNarratives: (id: string) => get<string[]>(`/timeline/${id}/narratives`),
  updateTimelineInfo: (request: UpdateTimelineInfoRequest) => send('PUT', '/timeline', request),

  insertCategory: (request: InsertCategoryRequest) => send('POST', '/category', request),
  updateCategory: (request: UpdateCategoryRequest) => send('PUT', '/category', request),
  deleteCategory: (categoryId: string) => send('DELETE', `/category/${categoryId}`),

  insertEpisode: (request: InsertEpisodeRequest) => send('POST', '/episode', request),
  updateEpisode: (request: UpdateEpisodeRequest) => send('PUT', '/episode', request),
  deleteEpisode: (episodeId: string) => send('DELETE', `/episode/${episodeId}`)
};
