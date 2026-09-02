# Episode images

Written 2026-08-30. Replaces v1's approach of storing image bytes in the database.
Re-rooted 2026-09-02, when a timeline became one folder (see `data-store.md`).

## Shape

The store holds a **filename**. The bytes live on disk, outside the repo, inside the
timeline's own folder. Nothing about an image reaches a server, and the whole timeline — the
JSON, its pictures and its prose — is one directory you can move, back up, or hand to someone.

```
<timelines root>/
  {timelineId}/
    data.v1.json                       source of truth (see data-store.md)
    images/
      cornerstone-church-a3f19d.webp   written by the app on upload
      kalamazoo-house.jpg              or dropped in by hand; both work
    narratives/…
```

Thumbnails are **not** stored here. They are derived data, generated on first request into a
cache directory the API owns and may delete at any time — outside the timeline folders, so
there is only ever one copy of anything to keep in order:

```
<local application data>/pictura-vita/thumbnails/{timelineId}/{name}@{size}.webp
(override with IMAGE_CACHE_PATH)
```

Two stored sizes would mean every image is a two-step manual chore, and the two would drift
the first time a photo was replaced. One folder of originals is a portability claim that
survives contact with reality.

## Resolution

`<TIMELINES_ROOT_PATH>/{timelineId}/images`, and nothing else. There is deliberately **no
override**: a second configured path could only ever point somewhere that breaks the one claim
the layout exists to make, which is that a timeline is one portable folder. There used to be an
`IMAGE_ROOT_PATH` escape hatch, and it went with the re-rooting.

A missing folder and a missing file are the same non-event: no image. Unlike
`TIMELINES_ROOT_PATH` itself, a missing images folder does **not** fail startup — images are
optional, and a timeline with none is a normal timeline. The folder is created on the first
upload, and up front for a timeline created in the app.

## Uploading

`POST /v1/timelines/{timelineId}/images`, multipart, fields `file` and `stem`.

The bytes are **decoded and re-encoded, never copied through**. That is what strips EXIF, and
EXIF is the reason to bother: a phone writes GPS coordinates into every photo, so a picture of
somewhere you lived carries that address in its metadata. It would otherwise ride along inside
any timeline folder that got copied, backed up or handed to someone — precisely the data this
application keeps off the network in the first place. Re-encoding drops all of it.

The orientation tag has to be *applied* before it is discarded, or every portrait phone photo
comes out on its side. `ImageStore.Upright` does that for all eight EXIF orientations.

Re-encoding also settles what a file actually is: the decoder decides, not the extension and
not the content type the client claimed. Everything is normalised to WebP, capped at 2560px on
the longest edge — far more than the full-size view can show, and small enough that the folder
stays copyable.

**The name is generated, never taken from the upload.** A client-supplied name is the same
untrusted input the read path defends against, and on the write path an escape overwrites
rather than merely discloses. It is a slug of the episode title plus six hex of the content
digest — `cornerstone-church-a3f19d.webp` — so the folder stays readable in Finder, uploading
the same picture twice is a no-op rather than a second copy, and two pictures sharing a title
cannot collide.

Two size limits sit in front of the endpoint and both have to be raised together, or the lower
one answers first with a bare 413: Kestrel's `MaxRequestBodySize` and the multipart form
length. Both are set to twice the application's own 25MB limit, so an over-large image reaches
the check that can say how big it was.

There is deliberately **no fetch-from-URL**. It would make the API issue requests to addresses
a page supplied — reaching whatever is on the loopback interface and the local network — and
it would be the first outbound connection in a design whose whole premise is that nothing
leaves the machine. Drag-and-drop and paste both deliver real bytes with nothing to fetch, and
between them they cover the cases that matter.

## Serving

`GET /v1/timelines/{timelineId}/images/{name}?size=thumb|full`

Served through an endpoint, not a static file directory, so the sandbox is enforced in one
place. This is not paranoia about a local app: the API is an HTTP server on loopback, and any
page open in the browser can issue requests to it. The filename comes from a data file, and a
data file is an input.

Validation, in order — any failure is a 404, never a 400, so probing tells you nothing:

- `Path.GetFileName(name) == name` (no separators, no `..`, not rooted)
- extension in `.jpg .jpeg .png .webp .gif`
- the resolved absolute path is still under that timeline's own images folder

Responses carry `Last-Modified` from the file's mtime and honour `If-Modified-Since`, so a
re-render does not re-fetch every visible thumbnail.

Reading is kept separate from decoding so that "the bytes could not be fetched" is told apart
from "the bytes are not a picture". This matters because the data directory lives in iCloud
Drive with Optimise Mac Storage on. Current macOS does not evict to `.icloud` placeholder
files — it leaves the file in place, full-sized and *dataless*, materialising on read — so
listing and existence checks stay correct and an evicted image simply costs a pause on first
view. What it must not do is what it used to: treat an unreadable source as a cache failure
and fall back to streaming the original, which failed again *after* the response had started
and truncated the body. An unreadable file is now an honest 404 and a log line that names the
likely cause.

`GET /v1/timelines/{timelineId}/images` returns the names actually present on disk. The client
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
`Category.Color` were added. Files written before this existed carry the property as null; the
client treats null as empty, as it already does for `icon`. (Reads have been strict since
`TimelineFileStore` replaced JsonFlatFileDataStore on 2026-09-02 — Newtonsoft ignored C#'s
`required`, System.Text.Json does not — so such a file is now refused with a message naming
the property rather than loading a null.)

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
4. Endpoints: `/v1/timelines/{id}/images` and `/v1/timelines/{id}/images/{name}`.
5. Layout: `imageName` on `LayoutEpisode`, `availableImageNames` on `LayoutInput`,
   `imageName` on `TimeItem`, `THUMBNAIL_MIN_WIDTH_PX`. Tests.
6. Render: thumbnail in the bar (`Band`), thumbnail in the detail panel opening a full-size
   overlay (`DetailPanel`), filename field in `EpisodeDialog`.
7. `.env.example`, this document.
