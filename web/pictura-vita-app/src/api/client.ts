import type {
  ApiTimeline,
  ApiTimelineSummary,
  CreateTimelineRequest,
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
 * A POST whose answer matters — the server chooses the new resource's id, so the caller has
 * nothing to construct it from. `send` is for the calls whose only useful answer is "it
 * worked".
 */
async function create<T>(path: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.ok) return response.json() as Promise<T>;

  if (response.status === 400) {
    const problem = await response.json().catch(() => null);
    const errors = problem?.errors as Record<string, string[]> | undefined;
    if (errors) throw new Error(Object.values(errors).flat().join(' '));

    // Not every 400 is a validation failure — a body the server cannot bind is one too, and
    // its detail says which field it choked on. Better than the status line on its own.
    const detail = problem?.detail ?? problem?.title;
    if (typeof detail === 'string') throw new Error(detail);
  }

  throw new Error(`POST ${path} failed: ${response.status} ${response.statusText}`);
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
    `${baseUrl}/timelines/${timelineId}/images/${encodeURIComponent(name)}` +
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
    response = await fetch(`${baseUrl}/timelines/${timelineId}/images`, { method: 'POST', body });
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
      `${baseUrl}/timelines/${timelineId}/narratives/${encodeURIComponent(name)}`
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
    response = await fetch(`${baseUrl}/timelines/${timelineId}/narratives`, {
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
  /**
   * Every timeline present under the timelines directory, as summaries.
   *
   * There is no "fetch them all in full" any more, and deliberately: each timeline is its own
   * file now, so that would mean the server parsing every one of them to draw a menu.
   */
  timelines: () => get<ApiTimelineSummary[]>('/timelines'),
  timeline: (id: string) => get<ApiTimeline>(`/timelines/${id}`),
  /**
   * Creates an empty timeline and returns it, id and all.
   *
   * The id comes back from the server rather than being chosen here, because the id names the
   * directory the timeline lives in — picking one client-side would be picking a path.
   */
  createTimeline: (request: CreateTimelineRequest) =>
    create<ApiTimeline>('/timelines', request),
  randomTimeline: () => get<ApiTimeline>('/timelines/random'),
  /**
   * The image file names actually present on disk for a timeline.
   *
   * Fetched alongside the timeline so the renderer knows what exists before it lays anything
   * out: discovering a missing image from a 404 mid-render means a flash of broken image and
   * a box that collapses afterwards.
   */
  timelineImages: (id: string) => get<string[]>(`/timelines/${id}/images`),
  /**
   * The narrative file names present on disk for a timeline.
   *
   * Fetched alongside the timeline for the same reason as the image listing: the detail
   * panel has to decide whether to offer "Read narrative" before it draws, and a button
   * that turns out to open nothing is worse than no button.
   */
  timelineNarratives: (id: string) => get<string[]>(`/timelines/${id}/narratives`),
  updateTimelineInfo: (request: UpdateTimelineInfoRequest) =>
    send('PUT', `/timelines/${request.timelineId}/info`, request),

  insertCategory: (request: InsertCategoryRequest) =>
    send('POST', `/timelines/${request.timelineId}/categories`, request),
  updateCategory: (request: UpdateCategoryRequest) =>
    send('PUT', `/timelines/${request.timelineId}/categories/${request.category.categoryId}`, request),
  deleteCategory: (timelineId: string, categoryId: string) =>
    send('DELETE', `/timelines/${timelineId}/categories/${categoryId}`),

  insertEpisode: (request: InsertEpisodeRequest) =>
    send('POST', `/timelines/${request.timelineId}/episodes`, request),
  updateEpisode: (request: UpdateEpisodeRequest) =>
    send('PUT', `/timelines/${request.timelineId}/episodes/${request.episode.episodeId}`, request),
  deleteEpisode: (timelineId: string, episodeId: string) =>
    send('DELETE', `/timelines/${timelineId}/episodes/${episodeId}`)
};
