# Episode images

Written 2026-08-30. Replaces v1's approach of storing image bytes in the database.

## Shape

The store holds a **filename**. The bytes live on disk, outside the repo, beside the data
file. Nothing about an image reaches a server, and the whole timeline — the JSON and its
images — is one directory you can move, back up, or hand to someone.

```
<data dir>/
  timeline-data.json               source of truth (see data-store.md)
  data.xlsx                        the original spreadsheet, kept for reference only
  images/
    {timelineId}/
      kalamazoo-house.jpg          originals only — you put files here, that's it
      first-day-at-acme.png
```

Thumbnails are **not** stored here. They are derived data, generated on first request into a
cache directory the API owns and may delete at any time:

```
<local application data>/pictura-vita/thumbnails/{timelineId}/{name}@{size}.webp
(override with IMAGE_CACHE_PATH)
```

Two stored sizes would mean every image is a two-step manual chore, and the two would drift
the first time a photo was replaced. One folder of originals is a portability claim that
survives contact with reality.

## Resolution order

The image root is **derived from `DATA_FILE_PATH`** rather than configured separately:

1. `IMAGE_ROOT_PATH`, if set — the escape hatch.
2. Otherwise `<directory of DATA_FILE_PATH>/images`.

Two independently configured paths can point at unrelated places, at which point "portable"
quietly stops being true. Deriving it keeps the data together by default.

Missing root, missing timeline folder, and missing file are all the same non-event: no image.
Unlike `DATA_FILE_PATH`, a missing image root does **not** fail startup — images are
optional, and a timeline with none is a normal timeline.

## Serving

`GET /timeline/{timelineId}/image/{name}?size=thumb|full`

Served through an endpoint, not a static file directory, so the sandbox is enforced in one
place. This is not paranoia about a local app: the API is an HTTP server on loopback, and any
page open in the browser can issue requests to it. The filename comes from a data file, and a
data file is an input.

Validation, in order — any failure is a 404, never a 400, so probing tells you nothing:

- `Path.GetFileName(name) == name` (no separators, no `..`, not rooted)
- extension in `.jpg .jpeg .png .webp .gif`
- the resolved absolute path is still under the resolved timeline root

Responses carry `Last-Modified` from the file's mtime and honour `If-Modified-Since`, so a
re-render does not re-fetch every visible thumbnail.

`GET /timeline/{timelineId}/images` returns the names actually present on disk. The client
fetches it alongside the timeline, so the renderer knows availability *before* layout — no
broken-image flicker, no reserved space that collapses. "No image" and "image missing" become
the same code path. The per-request 404 stays as the backstop.

This is a separate endpoint rather than a `hasImage` flag on `Episode`, because `Episode` is
the storage shape and image presence is not stored.

## Thumbnails

SkiaSharp, which is MIT (the Skia library it wraps is BSD-3-Clause). ImageSharp is nicer to
use but its licence is now the Six Labors split licence — fine personally, worth not making
load-bearing.

Longest edge 320px, WebP, aspect preserved. Regenerated when the original's mtime is newer
than the cached file's.

**HEIC is not supported** and never silently: SkiaSharp cannot decode it, so `.heic` is
outside the allowlist and a `.heic` name resolves to no image. Photos straight off an iPhone
need converting first. This is the failure most likely to be hit on the first real attempt.

## Schema

`Episode.ImageName` — a `required string`, empty for none, mirroring how `Category.Icon` and
`Category.Color` were added. JsonFlatFileDataStore reads through Newtonsoft, which ignores
C#'s `required`, so files written before this existed deserialize the property as null; the
client treats null as empty, as it already does for `icon`.

The JSON file is the master copy, so a name typed in the app stays put. The existing data file
was migrated on 2026-08-30 by adding `"imageName": ""` to all 139 episodes.

`SourceReaderService` also reads an `ImageName` from column 9 of the workbook, which is
vestigial: the spreadsheet is no longer the source of truth (see `data-store.md`), and
re-running the importer against the real data file would wipe every image name along with
everything else the workbook has no column for. The reader keeps the column so it does not
disagree with the domain model; an absent column reads as "no image".

One image per episode. Going to a list means touching the model, the API and the dialog —
worth knowing, not worth pre-building.

## Rendering threshold

v1 already had this rule (`docs/original-version-spec.md:207`):

```
if (ti.showimage && ti.width < 100 && ti.episodetype === 1) ti.showimage = false;
```

Same 100px boundary as the callout rule, one above the 30px sliver rule. So it belongs in the
layout module as an output on `TimeItem`, alongside `sliver` and `reference` — not in the
components. Rendered width is zoom-dependent: an episode crosses the threshold as you zoom,
and the layout module is the only thing that knows. It also stays testable there, since the
module is pure and DOM-free.

`TimeItem.imageName` is non-null only when all three hold: the episode names an image, the
name is present on disk, and the box is at least `THUMBNAIL_MIN_WIDTH_PX` wide.

## Steps

1. `Episode.ImageName`, `InsertEpisodeRequest.ImageName`, validators, `RandomTimelineProvider`.
2. Importer: `ImageName` column → `Occurrence` → `Episode`.
3. `ImageStore` in the API: root resolution, name validation, listing, thumbnail cache.
4. Endpoints: `/timeline/{id}/images` and `/timeline/{id}/image/{name}`.
5. Layout: `imageName` on `LayoutEpisode`, `availableImageNames` on `LayoutInput`,
   `imageName` on `TimeItem`, `THUMBNAIL_MIN_WIDTH_PX`. Tests.
6. Render: thumbnail in the bar (`Band`), thumbnail in the detail panel opening a full-size
   overlay (`DetailPanel`), filename field in `EpisodeDialog`.
7. `.env.example`, this document.
