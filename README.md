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

The 2026 pass is where it became a real application rather than a viewer: episode, category, subject and timeline editing; per-category icons and colours; confidentiality filtering; zoom; episode images; and JSON export.

---

## Why the data never leaves the machine

This is the constraint the whole design is bent around, and it is not a stylistic preference.

A complete personal timeline is **identity-verification-grade data**. Past addresses, former employers, vehicles owned, schools attended, dates for all of it — that is precisely the set of questions a bank or a credit card issuer asks to prove you are you. Losing a list of your old jobs isn't embarrassing; it's an identity theft kit, assembled and cross-referenced by the victim. There is no version of "we take your privacy seriously" that makes hosting other people's answers to their own security questions a good idea.

So:

- The data file lives outside the repository, on the user's own disk (path in a gitignored `.env`). Only fabricated sample data is committed.
- The API binds to loopback. The front end is a static SPA served by Vite on `127.0.0.1`, which proxies `/api/*` so the browser stays same-origin and the API needs no CORS policy at all.
- There are **no outbound calls**. Deliberately, there is no fetch-an-image-from-a-URL feature: it would make the API issue requests to addresses a page supplied, and it would be the first outbound connection in a design whose premise is that nothing leaves the machine.
- Uploaded images are decoded and re-encoded rather than copied, which strips EXIF. A phone writes GPS coordinates into every photo, so a picture of a house you lived in carries that address in its metadata — exactly the data being kept off the network in the first place.
- Export produces a file byte-compatible with the store's own format. The data belongs to whoever entered it and must be retrievable in a form that is useful without this application.

Hosting is not ruled out forever, but only in a shape where real timeline data still never reaches a server.

---

## How the data is stored

A single JSON file, `timeline-data.json`, read and written in place by the API. `Episodes`, `Categories` and `TimelineInfo` all live in it, and it is the **source of truth**.

Images sit beside it in an `images/<timeline id>/` directory derived from the data file's own path, so a timeline is one portable folder — the JSON and its pictures together — that you can move, back up, or hand to someone. Only the file *name* is stored; thumbnails are derived data, cached elsewhere and disposable.

**The spreadsheet is history.** Until 2026-08-30 the Excel workbook was authoritative and the JSON was regenerated from it by `Pictura.Vita.Excel.Importer`. That reversed when editing moved into the app: the workbook has no column for image names, category icons and colours, or confidentiality, so keeping it authoritative would mean losing all of that on every import. The importer still builds, but running it against the real data file is now **destructive** — it replaces the timeline it previously wrote. Treat it as a one-off migration tool that has already done its job. Details, and the escape hatch if it is ever needed again, are in [docs/data-store.md](docs/data-store.md).

---

## Running it

**Two processes are required.** The dev server alone shows "Cannot reach the Pictura Vita API".

```bash
dotnet run --project src/Pictura.Vita.Api
```

```bash
npm --prefix web/pictura-vita-app run dev
```

The app is then at <http://127.0.0.1:5173>, proxying `/api/*` to `http://localhost:5199`.

Before the first run, copy `src/Pictura.Vita.Api/.env.example` to `.env` and set `DATA_FILE_PATH`. Point it at the sample data in the build output to try it without any real data of your own. A missing or wrong path fails at startup with an explicit message rather than quietly serving an empty timeline. Note that `dotenv.net` *overwrites* real environment variables, so exporting `DATA_FILE_PATH` in your shell will not override the file — edit it.

Tests: `dotnet test src/Pictura.Vita.slnx` for the back end, `npm --prefix web/pictura-vita-app test` for the layout engine.

---

## Layout

```
src/                              .NET solution
  Pictura.Vita.Domain/            Episode, Category, Timeline, TimelineInfo, the enums
  Pictura.Vita.Domain.Extensions/ Derived values (duration, display names) kept off the storage records
  Pictura.Vita.Data/              JsonFlatFileDataStore provider; fabricated sample data
  Pictura.Vita.Api/               Minimal API, FluentValidation, image store and thumbnailer
  Pictura.Vita.Messaging/         Insert/update request contracts
  Pictura.Vita.Excel.Importer/    One-off spreadsheet migration (see the warning above)
  Pictura.Vita.Utility/           Deterministic GUIDs, Result<T>, date helpers
web/pictura-vita-app/             React + Vite front end
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
| [docs/data-store.md](docs/data-store.md) | Where the data lives, and why the importer is now retired |
| [docs/image-support.md](docs/image-support.md) | Image storage, EXIF stripping, thumbnail cache, path-traversal defences |
| [web/pictura-vita-app/README.md](web/pictura-vita-app/README.md) | Front-end scripts and the layout engine in detail |

These are working notes rather than user documentation: they record *why* a decision went the way it did, which is the part that is expensive to recover later.
