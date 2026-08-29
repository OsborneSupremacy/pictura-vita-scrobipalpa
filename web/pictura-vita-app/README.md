# pictura-vita-app

React + Vite front end for Pictura Vita.

> **Local only.** Timeline data is identity-verification-grade personal information and is
> never sent anywhere. The dev server binds to `127.0.0.1` and proxies API calls so the
> browser stays same-origin; the API needs no CORS policy as a result.

## Running

**Two processes are required.** The dev server alone will show
"Cannot reach the Pictura Vita API" — it serves the UI but has no data without the API.

From the repository root, in two terminals:

```bash
dotnet run --project src/Pictura.Vita.Api
```

```bash
npm --prefix web/pictura-vita-app run dev
```

The app is then at http://127.0.0.1:5173. Calls to `/api/*` are proxied to
`http://localhost:5199`; override with `API_ORIGIN` if the API runs elsewhere.

The API reads its data file path from `src/Pictura.Vita.Api/.env` (see `.env.example`
there). Note that `dotenv.net` **overwrites** real environment variables, so exporting
`DATA_FILE_PATH` in your shell will not override what `.env` says — edit the file instead.
A missing or wrong path fails at startup with an explicit message rather than quietly
serving an empty timeline.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with API proxy |
| `npm test` | Layout engine unit tests |
| `npm run test:watch` | Same, in watch mode |
| `npm run build` | Typecheck and production build |
| `npm run lint` | Typecheck only |

## The layout engine

`src/layout/` is a **pure module**: it computes the entire timeline geometry from
`(episodes, categories, floor, ceiling, totalWidth)` with no dependency on the DOM, the
clock, or the browser's time zone. `totalWidth` is the single measurement the caller
supplies. That is what makes it unit-testable — see `*.test.ts` alongside the source.

| File | Responsibility |
| --- | --- |
| `dates.ts` | Whole-day arithmetic in day numbers (no timezones) |
| `bounds.ts` | Deriving the drawn window from the episodes |
| `axis.ts` | Axis grain selection, boundary snapping, increment labels |
| `layout.ts` | Item geometry, callouts, slivers, rail packing, bands |
| `types.ts` | Input and output types |

Key behaviours, inherited from the original app and documented in
`docs/original-version-spec.md`:

- Widths are proportional: `daySpan / totalDays * totalWidth`, counted **inclusively** so a
  same-day episode is one day wide — matching `EpisodeExtensions.Duration` on the server.
- Rails are greedy first-fit. Gaps are filled with transparent placeholders because a rail
  is a flex row whose widths sum across the window, not absolutely positioned boxes.
- An era narrower than 100px also gets a callout pointing at it; at or below 30px the bar
  itself degrades to a bare sliver. This is what keeps dense timelines legible.
- Incident callouts are a fixed 100px and are nudged inside the window rather than
  overhanging it.
- A category with incidents but no eras gets a synthetic full-width reference bar so its
  callouts have something to point at.

Deliberate departures from the original:

- Day numbers instead of millisecond `moment` values, so time zones cannot skew widths.
- Zoom recomputes client-side; the original refetched from the server on every zoom.
- Bands are ordered by `Category.SortOrder` rather than by an incidental SQL `ORDER BY`.
- Resize is coalesced to animation frames instead of relaying out on every resize event.

## Not yet built

Category show/hide toggles, confidentiality filtering (which must be applied per
episode-category pair, not per episode), category icons and explicit per-category colours,
and anything that writes back to the API.
