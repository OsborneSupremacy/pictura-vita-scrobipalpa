# Original Version Spec — Pictura Vita v1 (BioGraphXweb2)

> Reference document for reimplementing v1 timeline rendering in this repo.
> Written for an AI agent working in `pictura-vita-scrobipalpa`; not a user-facing doc.
>
> **Source archive (read-only, not deployed):**
> `~/Library/Mobile Documents/com~apple~CloudDocs/docs/Archive/projects/BioGraphX/BioGraphXweb2`
>
> **Original stack:** ASP.NET MVC 5 (.NET Framework 4.6.1) + EF6 + SQL Server + AngularJS 1.x
> (ui-bootstrap, ngResource, ngSanitize) + Bootstrap 3 + FontAwesome 4 + moment.js.
> Layout math lived entirely in browser TypeScript (`Scripts/cntnr.ts`,
> `Scripts/picturaVitaApp/controllers/timelineController.ts`).
>
> **In scope for reproduction:** timeline rendering (the "graph"/"pictura"). **Out of scope:**
> ASP.NET Identity, accounts, profiles, sharing/`SharedName`, feedback, roles, image upload.

---

## 1. What the application did

A "visual CV" — a horizontally scaled timeline of a person's life. The user recorded
**episodes** (jobs, residences, relationships, illnesses, cars, speeding tickets…), tagged each
with one or more **user categories**, and the app drew one horizontal band per category across a
shared time axis. Everything is width-proportional: an episode's pixel width is its duration as a
fraction of the total timeline duration. Interaction: click any bar for a detail popover, zoom into
an axis increment or a single episode, filter by privacy level, toggle category visibility.

Marketing framing (Home/Index.cshtml): "The big picture of your life" — a visual CV/résumé that
isn't limited to career. Origin story (Home/About.cshtml): a spreadsheet the author kept to answer
"how many speeding tickets in the last N years", which grew into a life timeline.

### Terminology map (v1 → this repo)

| v1 | v1 values | this repo (`Pictura.Vita.Domain`) | Notes |
|---|---|---|---|
| Episode | — | `Episode` | v1 keyed by `int Id`; new is `Guid EpisodeId` |
| `EpisodeTypeId` | `1 = Event`, `2 = Moment` | `EpisodeType { Incident = 0, Era = 1 }` | **Ordinals are inverted.** v1 Event ≈ `Era`; v1 Moment ≈ `Incident` |
| UserCategory | per-person, soft-deletable, has `Icon` (FA class) + `PrivacyId` | `Category` | new `Category` has `Title`/`Subtitle`/`Confidentiality`; **no icon field yet** |
| Privacy | `0 Inherit, 1 Confidential, 2 OnlyMe, 3 Friends, 4 Public, 5 All` | `Confidentiality { Inherit=0, Public=1, Friends=2, OnlyMe=3 }` | **Ordering is inverted.** v1 ascending = more public; filter was `>= @PrivacyId`. New enum ascending = more private |
| Person (`Dob`/`Dod`, `SharedName`, `PublicBio`) | — | `Person` / `TimelineSubject` | new model adds `Organization` subjects and `DatePrecision` — no v1 equivalent |
| floor / ceiling | computed per request | `TimelineInfo.Start` / `.End` | see §3 |
| n/a | — | `DatePrecision` | **new concept**, v1 had day-precision dates only |

v1 had no `DatePrecision` and no organization subjects. v1 episode dates were SQL `date`
(day precision); `EndDate` nullable meaning "ongoing/indefinite", sentinel `9999-12-31` in the
proc. This repo's `Episode` has non-nullable `End`; the web app already treats `"9999-12-31"` as
"now" (`MAX_DATE` in `src/app/timeline/[id]/page.tsx`) — keep that convention.

---

## 2. v1 data model (SQL Server)

Tables (`BioGraphXDb/dbo/Tables/`):

- `Person(Id, Is_UserId, OwnedBy_UserId, First/Middle/LastName, SharedName, PublicBio, Dob, Dod, ProfilePicture, Deleted)`
- `Episodes(Id, PersonId, Title, SubTitle, Description, EpisodeTypeId, StartDate date NOT NULL, EndDate date NULL, AddedDate, Deleted, PrivacyId default 0=Inherit, Url, UrlDescription)`
- `UserCategories(Id, PersonId, Name, Description, Icon varchar(20), DefaultCategoryId, Deleted, AddedDate, PrivacyId default 2)`
- `EpisodeCategories(Id, EpisodeId, UserCategoryId, AddedDate, Deleted)` — many-to-many
- `DefaultCategories(Id, Name, Description, Icon)` — seeded: General, Employment, Education, Residence, Health, Leisure, Vehicles, Relationships
- `EpisodeType(Id, Name, Description)` — 1 Event ("lasts a significant period of time … drawn as a rectangle"), 2 Moment ("lasts a short period … drawn as a dot")
- `Privacy(Id, Name, Description, FilterHelpText, NotAvailableToCategories, DefaultFloorLimitId, DefaultCeilingLimitId)`
- `Limit(Id, Name, AvailableToFloor, AvailableToCeiling, AllowUserDate, AllowUserValue)` — seeded 1..7: DOB, DOD, Earliest Event, Latest Event, Fixed Date, Current Date, Current Date ± X Years
- `PersonLimit(PersonId, PrivacyId, FloorLimitId, CeilingLimitId, FloorUserDate, FloorUserValue, CeilingUserDate, CeilingUserValue)` — per-person, per-privacy-view timeline bounds
- `EpisodeImage(Id, EpisodeId, Picture varbinary(max))` — at most one image per episode

All deletes are soft (INSTEAD OF DELETE triggers set `Deleted = 1`).

`DataCommon.calculateLimit(Dob, Dod, LimitId, fixedDate, plusMinus)` resolves a `Limit` row to a
concrete date: 1→Dob, 2→Dod, 3/4→null (meaning "derive from data"), 5→fixedDate, 6→today,
7→today.AddYears(plusMinus).

---

## 3. Server contract: `dbo.GenerateCore` (the only thing worth porting server-side)

`GET /Episodes/Generate?privacyid&zoomInStart&zoomInEnd` → `dbo.GenerateCore`.
Params: `@PersonId, @PrivacyId, @FloorLimit, @CeilingLimit, @ZoomInFloor, @ZoomInCeiling`.
(`@FloorLimit`/`@CeilingLimit` come from `PersonLimit` via `calculateLimit`; zoom params from the UI.)

### Steps

1. **Select + privacy filter.** Join `Episodes → EpisodeCategories → UserCategories` (all
   `Deleted = 0`), `PersonId = @PersonId`, and
   `isnull(nullif(e.PrivacyId, 0), uc.PrivacyId) >= @PrivacyId` — i.e. episode privacy `0` means
   *inherit the category's privacy*. **An episode in N categories yields N rows.**
2. **`EndDate` normalization.** Moments (type 2): `EndDate = StartDate`. Events: `isnull(EndDate, '9999-12-31')`.
   `Indefinite = 1` iff type 1 with NULL `EndDate`.
3. **Empty fallback.** If zero rows, emit one synthetic row: Id 0, Title `"No Events Found"`,
   category `"No Events Found"`, type 1, start = end = tomorrow.
4. **Derived bounds.** `@Earliest = MIN(StartDate)`; `@Latest = MAX(EndDate)`;
   `@LatestNotEnd = MAX(EndDate)` excluding the `9999-12-31` sentinel, bumped to tomorrow if any
   episode is indefinite.
5. **Explicit bounds.** `@ExplicitFloor = 1` if either zoom-floor or floor-limit is non-null (same
   for ceiling). Where both exist, the **more restrictive** wins (floor = max, ceiling = min).
   Fall back to `@Earliest` / `@LatestNotEnd`.
6. **Visibility (`MeetsConditions`).** Moments: `StartDate BETWEEN @RealFloor AND @RealCeiling`.
   Events: overlap test `@RealFloor <= EndDate AND @RealCeiling >= StartDate`.
7. **Project.** One flat row set, ordered by `UserCategory, StartDate, EndDate, Title, Id`.

### Row shape returned to the client (JSON, dates as `yyyy-MM-dd` strings)

```
Id, Title, SubTitle, Description, Url, UrlDescription,
EpisodeTypeId,                 // 1 = Event, 2 = Moment
UserCategory, UserCategoryPrivacyId, CategoryIcon,
StartDate, EndDate,            // EndDate: sentinel replaced with @RealCeiling
FloorDate, CeilingDate,        // same on every row — the timeline bounds
ExplicitFloor, ExplicitCeiling,// bit
FromPast,                      // StartDate < @RealFloor  (clipped on the left)
IntoFuture,                    // EndDate sentinel or > @RealCeiling (clipped on the right)
Indefinite, EpisodeImageId
```

`FromPast` / `IntoFuture` drive the "squared-off edge" styling that signals clipping.

> **Bugs in the original proc — do not port:**
> - The ceiling block tests `if @ZoomInFloor is null or @CeilingLimit is null` — should be `@ZoomInCeiling`.
> - `if @RealCeiling is null begin if @RealFloor > @RealCeiling …` compares against a known-NULL — dead branch.

---

## 4. Client layout engine — the part that actually matters

Everything below is from `Scripts/cntnr.ts` (classes) and
`Scripts/picturaVitaApp/controllers/timelineController.ts` (`drawItems()`).
This is the algorithm to reproduce.

### 4.1 Global scalars

```
totalwidth = pixel width of #pictura          // measured from the DOM; recomputed on window resize
floor, ceiling                                // from row 0's FloorDate/CeilingDate, or widened by scanning
                                              // all rows when the bound is not explicit
duration   = dayEndVal(ceiling) - dayStartVal(floor)   // ms; day-inclusive
coduration = (duration / totalwidth) * 100    // ms equivalent of 100px — the fixed callout width
```

`dayStartVal(d) = startOf('day').valueOf()`, `dayEndVal(d) = endOf('day').valueOf()`.
Every width in the system is `ms / duration * totalwidth`.

`nodata` is true when `floor >= ceiling`.

**When bounds are not explicit**, the controller widens `floor`/`ceiling` by scanning every raw
row's `StartDate`/`EndDate` (seeded from row 0). When zoomed, it skips this — floor/ceiling are the
zoom range.

### 4.2 Axis (`class axis` / `class axisinc`)

Rendered **twice** — once above and once below all categories.

Increment selection from `yeardiff = ceiling.diff(floor, 'y')`:

| yeardiff | inctype | increment | short label | long label |
|---|---|---|---|---|
| ≤ 1 | `months` (3) | 1 month | `MMM YY` | `MMMM YYYY` |
| ≤ 10 | `years` (2) | 1 year | `YYYY` | `YYYY` |
| ≤ 80 | `fiveyears` (1) | 5 years | `YYYY-YY` | `YYYY - YYYY` |
| else | `tenyears` (4) | 10 years | `YYYY-YY` | `YYYY - YYYY` |

The left cursor snaps **backwards** to a natural boundary: month start; Jan 1; the previous year
divisible by 5; the previous year divisible by 10. Then iterate `while (leftcursor < ceiling)`,
each increment spanning `[leftcursor, leftcursor + inc - 1 day]`, clamped to `[floor, ceiling]`.
The first and last increments are therefore partial and narrower.

Per increment: `onfloor = start <= floor`, `onceiling = end >= ceiling`,
`widthpx = (dayEndVal(end) - dayStartVal(start)) / duration * totalwidth`.

Clicking an axis increment opens a popover offering **zoom to this period** (suppressed for
`inctype === months`, the finest grain). Popover placement: `top-left` when `onfloor`,
`top-right` when `onceiling`, else `top` (mirrored to `bottom-*` for the lower axis).

### 4.3 `timeitem` — one drawn box

Two flavours, both `timeitem`:

- **Event** (`episodetype === 1`): width from its own duration; occupies an event rail.
- **Moment** (`episodetype === 2`): zero-duration; drawn as a fixed-width (**100px**) callout
  centred on its date.

Construction (`timeitem` ctor):

```
vStart = (explicitfloor   && start < floor)   ? floor   : start     // clamp to view
vEnd   = (explicitceiling && end   > ceiling) ? ceiling : end
duration = dayEndVal(vEnd) - dayStartVal(vStart)

coduration = placeholder ? duration : the global coduration          // callout span in ms
costart = vStart - coduration/2                                      // callout centred on start
coend   = vStart + coduration/2
if coend   > ceiling: onceiling = true; coend = vEnd;   costart = vEnd - coduration
if costart < floor:   onfloor   = true; costart = vStart; coend = vStart + coduration

width = (episodetype === 2 ? coduration : duration) / duration_total * totalwidth
widthpx      = width + 'px'
titlewidthpx = (width - 60) + 'px'      // reserves room for a 50px image + padding
middleevent  = vStart + duration/2      // events only; anchor for the supplemental callout
```

Flags on a timeitem: `isplaceholder`, `sliver`, `showimage`, `supplement`, `supplementTo`,
`reference`, `intofuture`, `frompast`, `onfloor`, `onceiling`, `indefinite`.

### 4.4 Small-event handling (important — this is what makes dense timelines legible)

Per raw row, after building the event `ti`:

```
if (ti.showimage && ti.width < 100 && ti.episodetype === 1)  ti.showimage = false;

if (ti.episodetype === 1 && !ti.isplaceholder && ti.width < 100) {
    if (ti.width <= 30) { ti.isplaceholder = true; ti.sliver = true; }   // too small to label
    // emit a supplemental Moment-style callout anchored at ti.middleevent
    sti = new timeitem(..., start = end = ti.middleevent, episodetype = 2, ...)
    sti.supplement = true;
    sti.supplementTo = ti;                                              // popover reads through this
    cat.allitems.push(sti);
}
```

Thresholds: **`width < 100px` → also draw a callout** above/below the band;
**`width <= 30px` → the bar itself becomes a `sliver`** (a bare coloured stripe, no text, and
flagged `isplaceholder` so it is skipped by the label renderer).

Every timeitem gets `supplementTo` set (self-referencing for normal items), so the single popover
template works uniformly: the popover reads `timeitem.supplementTo.*` for every field, and falls
back to a bare `timeitem.title` heading only for `reference` items. Keep that indirection or flatten it.

### 4.5 Rails (greedy interval packing, per category)

A **rail** is one horizontal row within a category band. Items are laid out as a flex row of
`inline-block` divs with **no absolute positioning** — a rail is a sequence of alternating
*placeholder* (transparent spacer) and *real* items whose widths sum across the timeline.

For each category, for each item **in the order produced by the SQL `ORDER BY`**:

```
find first existing rail r where
    r.episodetype === item.episodetype
    AND r.end < (item.episodetype === 1 || item.isplaceholder ? item.start : item.costart)
if none found:
    r = new rail(start = floor, episodetype = item.episodetype, colorcycle = <category's color>)

// gap spacer
phEnd = (item.episodetype === 2 ? item.costart : item.start) - 1 day
if (r.end.startOf('day') !== phEnd.startOf('day'))
    r.add(placeholder timeitem spanning [r.end, phEnd])

r.add(item)
r.end = (item.episodetype === 1 ? item.end : item.coend)
```

Consequences to preserve: event rails and moment rails are **separate** (never mixed);
overlapping items in the same category spill onto additional rails; the leading spacer from
`floor` is what left-positions the first item.

**Reference rail.** If a category ends up with moments but *no* events, a synthetic full-width
event is added (`reference = true`, title = category name, spanning `floor → ceiling`,
`intofuture = frompast = true`) so the moment callouts have a bar to point at.

### 4.6 Category colors

```
colorcycle = 0; definedcolors = 6;
per category: assign colorcycle to that category's rails; colorcycle++; if (colorcycle > 6) colorcycle = 0;
```

→ CSS classes `.cat-0` … `.cat-6` (7 gradients: grey, blue, green, red, orange, purple, yellow;
`.cat-2` and `.cat-6` force black text). All rails of a category share one color.

### 4.7 Vertical composition per category band

Top-to-bottom, from `Views/Graph/pictura.cshtml`:

1. **Upper moment rails** — moment rails at **even** index, `align-items: flex-end`, each item
   followed by a downward arrow (`.arrow-down`).
2. **Category header** — `<h1>` with the category's FontAwesome icon + name.
3. **Event rails** — `align-items: flex-start`, colored bars.
4. **Lower moment rails** — moment rails at **odd** index, arrow-up first, then the callout box.

Moment rails therefore alternate above/below the band. Callouts are the yellow gradient boxes;
events are the category-color gradient bars.

Page composition: top axis → category bands → bottom axis.

### 4.8 Interaction

- **Popover on any item** (`Views/Graph/popover.cshtml`, trigger `outsideClick`): title, image,
  subtitle, date range (`MM/DD/YYYY`), duration in years to 2 dp, "N through M years ago"
  (`yearsAgo` = `max(today+1d, ceiling).diff(start, 'months') / 12`), external link (behind a
  "Leaving Pictura Vita" interstitial modal — the app never linked out directly), description,
  Edit button, and a **zoom-to-this-event** button for events.
  Placement: `top-left` if the item touches the floor, `top-right` if it touches the ceiling, else `top`.
- **Zoom** — `zoomIn(start, end)` sets `floor`/`ceiling`, `zoomed = true`, both explicit flags true,
  and **refetches from the server** with `zoomInStart`/`zoomInEnd`. `resetzoom()` clears and refetches.
  A "Reset Zoom" affordance appears while zoomed.
- **Category visibility** — modal with a checkbox per category (`ng-hide` on the band); Select All / None.
  Purely client-side.
- **Privacy filter** — dropdown of `Privacy` rows where `NotAvailableToCategories = 0`; refetches. Default `2` (OnlyMe = all non-confidential).
- **Resize** — on `window.resize`, remeasure `#pictura` and re-run `drawItems()` (no refetch).
  `body { overflow-y: scroll }` is forced so the scrollbar can't change the measured width after layout.

### 4.9 Styling notes worth keeping (`Content/graph01.scss`)

- `#pictura` is `98%` wide, centered, bordered, with a subtle top-down dark gradient.
- `.axis` — 35px tall, black gloss gradient, white bold centered labels, `overflow: hidden` +
  `text-overflow: ellipsis`, `border-right: 1px solid gray` per increment (dropped when `.into-future`).
- `.timeitem` — `border-radius: 10px`, `min-height: 30px`, `max-height: 100px`, inset border,
  drop shadow, 5px padding. `.from-past` squares off the left corners; `.into-future` squares off
  the right — that's the clipping signal.
- `.sliver` — 30px tall, no padding, `vertical-align: top`.
- `.momentcntnr > div` — yellow gradient, 4px radius, 10.5px title / 10px subtitle, with a
  CSS-triangle arrow (`.arrow-up` / `.arrow-down`) positioned at `calc(50% - 5px)`, or pinned to
  the edge when `.from-past` / `.into-future`.
- `.ph` (placeholder) — `background-color: darkblue` in the source, i.e. **it was visible**; in the
  new version this should just be transparent.
- Titles: bold first line, ellipsized single line, centered; image `50×50` (events) / `25×25` (moments).

---

## 5. Other v1 screens (context only — not being reproduced)

- `Episodes/Index` — sortable/filterable table of episodes with add/edit/delete modals
  (`eventlistController.ts`, `editEventController.ts`).
- `TimelineSettings/Index` — per-privacy-view floor/ceiling limit configuration (the `PersonLimit`
  table). The concept ("your public view only shows the last 20 years") may be worth keeping.
- `UserCategories/*` — CRUD with a bootstrap-iconpicker for the FontAwesome icon.
- `Public/Index/{sharedname}` — anonymous read-only timeline at `picturavita.com/public/<name>`,
  forced to `Privacy.Public`. Same Angular controller; `$scope.public` derived from the URL
  containing `/public/`.
- Account/Manage/Roles/Feedback/Profile — ASP.NET Identity. **Explicitly out of scope.**

---

## 6. Known v1 defects — do not reproduce

- Supplemental and placeholder `timeitem`s pass `$scope.explicitFloor` in the **`explicitceiling`**
  argument slot (`timelineController.ts`) — right-edge clamping is wrong for those items.
- `$scope.duration = ($scope.rawitems.length === 0 || (dayEndVal(ceiling) - dayStartVal(floor)))`
  evaluates to the boolean `true` when there are no items, then gets used as a divisor.
- `moment(x).subtract("milliseconds", n)` uses the reversed (deprecated) argument order throughout.
- `orderBy:reverse:true` in `pictura.cshtml` references an undefined scope property; it is a no-op.
- Two `GenerateCore` bugs listed at the end of §3.
- Layout is recomputed in full on every resize tick with no debounce.
- Widths are computed in the client from a DOM measurement, so the layout is not renderable
  server-side. **Consider computing layout as pure functions of `(episodes, floor, ceiling, width)`**
  so it can be unit-tested and SSR'd — the algorithm itself has no DOM dependency beyond `totalwidth`.

---

## 7. Reimplementation notes for this repo

Current state: `Pictura.Vita.Api` (a minimal API over `TimelineFileStore`, one folder per
timeline — see `data-store.md`) serves `Timeline { TimelineInfo, Episodes[], Categories[] }`.
The Next.js app under `web/pictura-vita-web` is **to be discarded** and replaced with React +
Vite — the data must never reach a server, so a static SPA against a localhost API fits the
constraint where SSR does not.

**Hard constraint:** the timeline data is identity-verification-grade personal information and must
never be stored on a web server. Real data lives outside the repo (path in `.env`, which is
gitignored — see `.env.example`); only fabricated sample data is committed.

Gaps between the v1 algorithm and this repo's model:

1. **No `CategoryIcon`** on `Category` — v1 rendered a FontAwesome class in the band header.
   Still open, along with an explicit per-category color (v1 cycled colors by position, so a
   category's color shifted whenever another was added ahead of it).
2. ~~No `Indefinite` flag~~ — **added.** `Episode.Indefinite` is authoritative; `End` is
   `DateOnly.MaxValue` whenever it is true, and validators enforce that invariant both ways.
   Derive the "runs into the future" rendering from `Indefinite`, not from a date comparison.
3. **No `FromPast`/`IntoFuture`** — compute client-side from clamping against `TimelineInfo.Start/End`
   rather than server-side.
4. **`Episode.CategoryIds` is a list**, so an episode appears once in the payload but must be
   **fanned out per category** before rail packing (v1 got the fan-out for free from the SQL join).
   The same applies to confidentiality: v1's row-per-category join let one episode be visible in one
   band and hidden in another, so filtering belongs per (episode, category) pair, not per episode.
5. ~~`Episode.Duration` is stored~~ — **removed.** Duration is now
   `EpisodeExtensions.Duration(asOf)`, computed from the dates, measured to `asOf` when indefinite,
   and never negative. Dates are the single source of truth.
   **Counted inclusively**, matching v1's `dayEndVal(end) - dayStartVal(start)`: a same-day episode
   lasts 1 day, `Jan 1 - Jan 2` lasts 2. Layout widths must use the same convention or every bar
   comes out one day short — invisible across decades, but real at month-increment zoom.
   `DateOnly.DayCount` stays a plain signed subtraction; only the episode-level duration adds the +1.
6. **`DatePrecision`** is new; v1 has nothing to say about it. It is currently plumbed through every
   layer but always set to `Day` and read by nothing — it probably belongs in the popover / label
   formatting, and possibly in axis increment selection.
6b. **`Category.SortOrder`** — **added.** Band order is explicit rather than v1's accidental
   `ORDER BY UserCategory`. Sort bands by it; do not rely on collection order from the JSON store.
   Likewise, sort episodes explicitly before rail packing — v1 depended on the SQL `ORDER BY`.
7. **`EpisodeType.Incident` vs `Era`** replaces Moment/Event, with a threshold definition
   ("duration ≤ 1 day" = Incident) — v1 let the user choose the type explicitly. The v1 rendering
   split (rails vs. callouts) maps onto Era vs. Incident.
8. **Confidentiality ordering is inverted** vs. v1 `Privacy` — any filter predicate ported from
   `GenerateCore` must flip its comparison direction.

Suggested port order: pure layout module (axis + timeitem + rail packing, unit-tested) → React
band renderer (flex rows of spacers + items, matching §4.7) → popover → zoom → category toggles.
