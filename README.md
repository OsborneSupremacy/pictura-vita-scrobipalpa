# Pictura Vita

A visual CV — the big picture of a life, drawn as a horizontally scaled timeline.

You record **episodes** (jobs, homes, relationships, illnesses, cars, speeding tickets, trips, anything with a date), tag each with one or more **categories**, and the application draws one horizontal band per category across a shared time axis. Everything is width-proportional: an episode's pixel width is its duration as a fraction of the whole timeline. Click a bar for details, zoom into an axis increment or a single episode, filter by category or by audience.

> The repository is named `pictura-vita-scrobipalpa`; `scrobipalpa` is a nonsense word added only to make the repository name unique. The application is **Pictura Vita**.

---

## Where it came from

**The spreadsheet.** It began as a spreadsheet, kept to answer a question that turns out to be surprisingly hard to answer from memory: *how many speeding tickets have I had in the last N years?* Once dates were in a grid, other things went in too — addresses, employers, cars, schools — and it stopped being a record of tickets and became a record of a life. The interesting part is that a life laid out proportionally on a time axis reads completely differently from the same facts in a list. A CV tells you where you worked. A timeline shows you that the job you remember as brief was actually a third of your twenties, and that three unrelated upheavals all landed in the same eighteen months.

**v1 — BioGraphX.** The first working implementation, an ASP.NET MVC 5 + AngularJS 1.x application over SQL Server, framed at the time as "the big picture of your life": a visual CV that isn't limited to career. It is no longer deployed. Its layout algorithm — proportional widths, axis increment selection, greedy rail packing, the callout and sliver thresholds — was the genuinely valuable part, and it has been reverse-engineered from the archive into [docs/original-version-spec.md](docs/original-version-spec.md) so it could be rebuilt rather than reinvented.

**This repository** is the rewrite, and it took several runs at it:

| When | What |
| --- | --- |
| Jul 2022 | First attempt: an ASP.NET host with an Angular `ClientApp`. Petered out in 2023. |
| Jan 2025 | Restart. Domain model, minimal API over a JSON flat file, and an Excel importer to lift the spreadsheet in. |
| Jun 2025 | A Next.js front end, barely started. |
| Aug 2026 | Next.js discarded, React + Vite front end built, the v1 layout engine reproduced as a pure module, editing moved into the app, and the spreadsheet retired as the source of truth. |

The 2026 pass is where it became a real application rather than a viewer: episode, category, subject and timeline editing; per-category icons and colours; confidentiality filtering; zoom; episode images; Markdown narratives; and JSON export.

---

## Owning your own stories

If you have used Facebook, Instagram, LinkedIn or any of the platforms that came before them, you have probably written far more of your own history than you realise: status updates, photo captions, the long anniversary post, the account of a trip written while you were still on it. Those are stories about your life, and they live on someone else's server, in someone else's format, under terms someone else can change.

Two things routinely happen to them. Either the platform goes away — MySpace lost more than a decade of uploads in a botched migration, Google+ was switched off, Vine simply stopped — or you want to leave and don't, because deleting the account means abandoning the only copy of things you wrote. The official escape hatch is not much comfort: a downloaded archive of scattered HTML and JSON blobs is technically your data and practically a shoebox in the attic.

And even when the platform survives and behaves, the shape is wrong. A feed is built for the moment something was posted, not for finding it again fifteen years later, and it can never show a post against the rest of your life — the job you had at the time, the city you were living in, what else was going on that year.

**Pictura Vita is somewhere to bring them home.** Each of those posts becomes an episode: a date, a title, a category, and — where the writing deserves it — a Markdown **narrative** holding the full text, with the photographs sitting beside it. On the timeline it stops being an isolated post and takes its place in a band, in proportion, among everything else that was happening.

Getting them in is deliberately manual and deliberately dull. Narratives are `.md` files in a folder and images are ordinary image files, so you can pull your archive off the platform and drop things in with whatever editor or script suits you; the episode dialog lists whatever it finds on disk. There is no importer to wait for and no integration to be revoked.

What you are left with is legible without this application:

- One JSON file of dates, titles and categories — openable by a person in any text editor.
- One Markdown file per narrative, in the format the whole world already reads.
- One folder of images, as ordinary files.

Nothing is proprietary and nothing is encoded, so a short script — or a language model handed a single file — can turn the lot into whatever format comes next. That is the real test of ownership: not whether an export button exists, but whether the export is worth anything on the day the thing that produced it stops running. If Pictura Vita disappeared tomorrow, you would still have a folder of your own writing, in date order, that any tool can read.

---

## Why the data never leaves the machine

This is the constraint the whole design is bent around, and it is not a stylistic preference.

A complete personal timeline is **identity-verification-grade data**. Past addresses, former employers, vehicles owned, schools attended, dates for all of it — that is precisely the set of questions a bank or a credit card issuer asks to prove you are you. Losing a list of your old jobs isn't embarrassing; it's an identity theft kit, assembled and cross-referenced by the victim. There is no version of "we take your privacy seriously" that makes hosting other people's answers to their own security questions a good idea.

So:

- The timelines live outside the repository, on the user's own disk (path in a gitignored `.env`). Only fabricated sample data is committed.
- The API binds to loopback. The front end is a static SPA served by Vite on `127.0.0.1`, which proxies `/api/*` so the browser stays same-origin and the API needs no CORS policy at all.
- There are **no outbound calls**. Deliberately, there is no fetch-an-image-from-a-URL feature: it would make the API issue requests to addresses a page supplied, and it would be the first outbound connection in a design whose premise is that nothing leaves the machine. A picture in a narrative resolves only to the timeline's own image folder for the same reason — a remote `src` would be fetched the moment the narrative was opened, leaking which episode is being read, and when.
- Uploaded images are decoded and re-encoded rather than copied, which strips EXIF. A phone writes GPS coordinates into every photo, so a picture of a house you lived in carries that address in its metadata — exactly the data being kept off the network in the first place.
- Export produces one plain JSON file holding every timeline whole. The data belongs to whoever entered it and must be retrievable in a form that is useful without this application.

Hosting is not ruled out forever, but only in a shape where real timeline data still never reaches a server.

---

## How the data is stored

**A timeline is a folder.** It is named for the timeline's id, and everything belonging to that timeline is inside it:

```
timelines/
  01979e65-0ab5-7a48-85d5-968f1be9f671/
    data.v1.json      the episodes, the categories, the timeline info — the source of truth
    images/           the episode pictures
    narratives/       the long-form Markdown account of an episode
  0197a1c3-…/
    …
```

Copy that folder and you have copied the timeline entire — the dates, the pictures and the writing. Delete it and nothing else is touched. Hand it to someone and they have all of it. `TIMELINES_ROOT_PATH` points at the directory holding them, the app's first page lists whatever it finds there, and a folder dropped in by hand appears with nothing to register it with: there is no index file, deliberately, because an index is a second source of truth and the first thing to go stale.

Only the file *name* is stored for a picture or a narrative; thumbnails are derived data, cached outside the folder and disposable.

Prose is a file rather than a JSON field for reasons that are not the reasons images are: a thousand words in an escaped JSON string makes a backup's diff useless, rewrites the whole timeline file on every save, and sits somewhere no editor can open it.

Until 2026-09-02 there was instead a single `timeline-data.json` holding every timeline at once, with `images/` and `narratives/` beside it keyed by timeline id — so "one portable folder" was a claim the layout did not actually support. `Pictura.Vita.Migration` converts one to the other, non-destructively; see [docs/data-store.md](docs/data-store.md).

**The spreadsheet is history.** Until 2026-08-30 the Excel workbook was authoritative and the JSON was regenerated from it by `Pictura.Vita.Excel.Importer`. That reversed when editing moved into the app: the workbook has no column for image names, category icons and colours, or confidentiality, so keeping it authoritative would mean losing all of that on every import. The importer still builds, but running it against your real timelines is now **destructive** — it replaces the timeline it previously wrote. Treat it as a one-off migration tool that has already done its job. Details, and the escape hatch if it is ever needed again, are in [docs/data-store.md](docs/data-store.md).

---

## Running it

**Two processes are required** either way. The dev server alone shows "Cannot reach the Pictura Vita API".

### With Docker

One command, and neither the .NET SDK nor Node has to be installed on the machine.

```bash
docker compose up --build
```

The app is then at <http://127.0.0.1:5173>, proxying `/api/*` to the API container; the API itself is at <http://127.0.0.1:5199>, with its Scalar reference at <http://127.0.0.1:5199/scalar/v1>. Both ports are published on loopback only — nothing here is reachable from the network, which is the same boundary the app draws when run directly.

**Your timelines stay on your machine.** The container gets a directory, mounted read-write at `/timelines`, and nothing else: each timeline's `data.v1.json`, its `images/` and its `narratives/` all live inside their own folder in there. Nothing is copied into the image, and deleting every container and volume leaves the directory untouched.

Point it at your own data by copying `.env.example` (the one beside `compose.yaml`, not the API's) to `.env`:

```bash
PICTURA_VITA_TIMELINES_DIR=/path/to/my-timelines
```

Your real timelines are identity-grade data and belong **outside** the working copy — see [Why the data never leaves the machine](#why-the-data-never-leaves-the-machine). The default, `./data`, is gitignored and is there for the sample:

```bash
cp -R src/Pictura.Vita.Data/test/timelines/* data/
```

The front-end container runs the Vite dev server against the bind-mounted source, so editing a file on the host still hot-reloads the browser. Editing back-end code does not: rebuild with `docker compose up --build api`.

Two things are worth knowing. The published ports are the same ones a direct run uses, so Compose will refuse to start if `dotnet run` or `npm run dev` is already holding them — run one or the other, not both. And thumbnails are cached in a named Docker volume rather than in your data directory, so they survive a restart; `docker compose down -v` discards them and they are regenerated on demand.

### Directly

```bash
dotnet run --project src/Pictura.Vita.Api
```

```bash
npm --prefix web/pictura-vita-app run dev
```

Same addresses as above.

Before the first run, copy `src/Pictura.Vita.Api/.env.example` to `.env` and set `TIMELINES_ROOT_PATH`. Point it at `src/Pictura.Vita.Data/bin/Debug/net10.0/test/timelines` to try it on the sample data without any of your own — the build refreshes that copy every time, so writes never dirty the checked-in one. An unset value, or a directory that does not exist, fails at startup with an explicit message rather than quietly serving an empty table of contents; an *empty* directory is fine, and is what a first run looks like. The API loads `.env` with `overwriteExistingVars: false`, so a value exported in your shell **wins** over the file — which is what makes `TIMELINES_ROOT_PATH=/tmp/scratch dotnet run …` a safe way to point a run at throwaway data without touching your `.env`. That is also how Compose configures the container, which is why the API's `.env` is deliberately kept out of the image.

Tests: `dotnet test src/Pictura.Vita.slnx` for the back end, `npm --prefix web/pictura-vita-app test` for the layout engine. Both run on the host; there is no container for them.

---

## Layout

```
compose.yaml                      Both processes in containers (see "Running it")
data/                             Default mount point for the timelines directory; gitignored
src/                              .NET solution
  Pictura.Vita.Domain/            Episode, Category, Timeline, TimelineInfo, the enums
  Pictura.Vita.Domain.Extensions/ Derived values (duration, display names) kept off the storage records
  Pictura.Vita.Data/              TimelineFileStore (one folder per timeline); fabricated sample data
  Pictura.Vita.Api/               Minimal API, FluentValidation, image store and thumbnailer, narrative store
    Dockerfile                    Built from src/, which is the whole reference closure
  Pictura.Vita.Messaging/         Insert/update request contracts
  Pictura.Vita.Excel.Importer/    One-off spreadsheet migration (see the warning above)
  Pictura.Vita.Migration/         One-off conversion from the old single-file store
  Pictura.Vita.Utility/           Deterministic GUIDs, Result<T>, date helpers
web/pictura-vita-app/             React + Vite front end
  Dockerfile                      Runs the dev server against the bind-mounted source
  src/layout/                     The layout engine — pure, DOM-free, unit-tested
docs/                             Design notes (see below)
```

### The layout engine

`web/pictura-vita-app/src/layout/` computes the entire timeline geometry from `(episodes, categories, floor, ceiling, totalWidth)` with no dependency on the DOM, the clock, or the browser's time zone. `totalWidth` is the single measurement the caller supplies, which is what makes the whole thing unit-testable. Behaviours inherited from v1 — inclusive day counting, greedy first-fit rail packing, the 100px callout threshold and the 30px sliver threshold, synthetic reference bars for categories that contain only incidents — are documented alongside the deliberate departures in [web/pictura-vita-app/README.md](web/pictura-vita-app/README.md).

Zoom recomputes client-side. v1 refetched from the server on every zoom; when layout is a pure function, there is nothing to fetch.

---

## Docs

| Document | What it covers |
| --- | --- |
| [docs/original-version-spec.md](docs/original-version-spec.md) | v1's data model, stored-procedure contract and layout algorithm, reverse-engineered from the archive — including the bugs deliberately not reproduced |
| [docs/data-store.md](docs/data-store.md) | One folder per timeline, how to migrate to it, and why the importer is now retired |
| [docs/image-support.md](docs/image-support.md) | Image storage, EXIF stripping, thumbnail cache, path-traversal defences |
| [docs/narrative-support.md](docs/narrative-support.md) | Markdown narratives: why a file and not a field, naming, and why the renderer needs no sanitizer |
| [web/pictura-vita-app/README.md](web/pictura-vita-app/README.md) | Front-end scripts and the layout engine in detail |

These are working notes rather than user documentation: they record *why* a decision went the way it did, which is the part that is expensive to recover later.
