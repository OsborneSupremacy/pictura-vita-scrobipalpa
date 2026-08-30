# Episode narratives

Written 2026-08-30, alongside `image-support.md` and following the same shape.

A **narrative** is the long-form Markdown account of an episode — the anecdote behind the
bar on the timeline. It does not replace `Description`, which stays the short summary shown
in the detail panel. An episode can have both, either, or neither.

## Why a file and not a field

The store holds a **filename**; the text lives on disk beside the data file. The reasons are
not the same as the ones for images, and are worth stating.

A JSON field holds prose as one escaped line. That makes `git diff` on a backup useless,
rewrites the entire timeline file on every keystroke-save, and puts a thousand words of
writing somewhere no editor can open. A `.md` file is diffable, is written by whatever the
user actually writes in — Obsidian, iA Writer, vim — and can be grepped. It also keeps the
JSON file the size it is meant to be: a record of dates and titles.

```
<data dir>/
  timeline-data.json                     source of truth (see data-store.md)
  images/
    {timelineId}/…
  narratives/
    {timelineId}/
      moving-to-kalamazoo.md             written by the app, or dropped in by hand
      the-speeding-ticket-on-i-94.md
```

The whole timeline — the JSON, its pictures and its prose — stays one directory you can
move, back up, or hand to someone.

## Resolution order

Identical to images, and derived for the same reason:

1. `NARRATIVE_ROOT_PATH`, if set — the escape hatch.
2. Otherwise `<directory of DATA_FILE_PATH>/narratives`.

Two independently configured paths drift apart, and then "portable" quietly stops being
true. A missing root is not a startup failure: narratives are optional, and an episode
without one is an ordinary episode.

## Naming

`NarrativeFileName.Suggest` produces a slug of the title, made unique with a counter:
`moving-to-kalamazoo.md`, then `moving-to-kalamazoo-2.md`.

**Deliberately not content-addressed**, which is the one real departure from how images are
named. An image is *replaced*; a narrative is *edited*. A name derived from the text would
change on every save, leaving a new file behind each time and breaking the reference the
episode holds. So the name is derived from the title once and then kept — which is also why
the episode stores it rather than deriving it on read, and why renaming an episode does not
rename its file.

The uniqueness counter runs against the directory rather than the timeline, so a file put
there by hand is never overwritten by a new episode that happens to share its title.

## The write path accepts a name

This is the other departure. Image upload *always* generates the name and never accepts one,
on the grounds that a client-supplied name on the write path overwrites rather than merely
discloses. A narrative cannot work that way: it is edited repeatedly and its name must not
move underneath the episode referring to it, so something has to say which file to write.

What makes that safe is that the supplied name goes through `NarrativeFileName.IsValid` and
then `ResolveWithin` — the same containment check the read path uses — and an unsafe name is
**refused outright** rather than quietly redirected. Both checks now live in
`StoredFileName`, shared with `ImageFileName`, so there is exactly one implementation of the
path-traversal rule for the read path and the write path to agree on.

Writes are atomic (temp file, then move). This is the only writer of prose the user typed;
everything else in the application has a second copy in the JSON store.

## Endpoints

- `GET /timeline/{id}/narratives` — the names present on disk. Fetched with the timeline, so
  the detail panel knows whether to offer "Read narrative" *before* it draws. A button that
  turns out to open nothing is worse than no button.
- `GET /timeline/{id}/narrative/{name}` — the Markdown, as `text/markdown`.
- `PUT /timeline/{id}/narrative` — `{ name, stem, text }`, answers `{ narrativeName }`.
  Empty `name` means "generate one from `stem`".

Every read failure — an unsafe name, a name escaping the root, a missing file, bytes that
cannot be fetched — answers the same **404**, so probing says nothing about what exists
outside the sandbox. The unreadable case gets a log line naming the likely cause, since the
data directory lives in iCloud Drive with Optimise Mac Storage on.

Served through an endpoint rather than a static directory, for the reason images are: the
API is an HTTP server on loopback that any page in the browser can reach, and the filename
comes from a data file.

Cap: 1 MB of UTF-8, roughly 150,000 words. The limit stops a runaway paste filling the data
directory; no real narrative approaches it.

## Rendering

`markdown-it`, client-side, in `web/pictura-vita-app/src/markdown/narrative.ts`. Two settings
carry the safety, and there is deliberately **no sanitizer** because nothing dangerous is
produced to sanitize:

- **`html: false`** — raw HTML is escaped rather than passed through, so a `<script>` or an
  `<img onerror=…>` in a file renders as the text it is. The file is an input; "it is the
  user's own prose" is not a security model for something that reaches
  `dangerouslySetInnerHTML`.
- **Images resolve only to this timeline's own image folder, by bare name** —
  `![The house](kalamazoo-house.jpg)`. A remote `src` would be fetched the moment the
  narrative was opened: the first outbound request in an application whose premise is that
  nothing leaves the machine, and a leak of *which episode is being read, and when*, to
  whoever serves it. Anything else renders as its alt text.

  The name is also checked against `GET /timeline/{id}/images` before an `<img>` is emitted
  at all — the rule the layout and the detail panel already follow — so a stale reference
  draws as alt text rather than a broken-image glyph in an empty frame.

Links are left alone: following one is the reader's decision, and markdown-it's own
validation already refuses `javascript:` and friends. They open in a new tab with
`rel="noreferrer noopener"`, so a click does not throw away the timeline, the zoom and the
open panel.

`breaks: false` — CommonMark's rule, so reflowing a paragraph in another editor does not
change how it renders. `typographer: true`, because this is prose.

## Reading and writing in the app

**Reading**: the detail panel offers "Read narrative →", which opens a full-screen reader
(`NarrativeReader`) — the pattern the full-size image view already uses. An overlay rather
than more content in the panel, because the two want opposite things: the panel is a small
box pinned to a bar, and long prose wants a comfortable measure and somewhere to scroll.

The text is fetched **when the reader opens**, not with the timeline. A timeline holds
hundreds of episodes and a narrative runs to thousands of words; loading every one to decide
whether to show a button would pay the whole cost for the one that gets opened.

**Writing**: the episode dialog gets a Narrative section — a Markdown textarea with a
Write/Preview toggle, the file name below it, and a live word count. The file is saved
*before* the episode, because only the server knows what a newly created one is called and
the name has to come back before the episode can point at it. If the episode save then
fails, the file is left behind unreferenced: a stray `.md` in a folder, which is the better
half of the trade against losing prose that was just typed.

Two things the editor will not do:

- It does not reload when the name changes while there are unsaved edits. Replacing typed
  text with the contents of another file is not something choosing a name should silently do.
  Text typed against one name and then pointed at another is written to the new name, which
  is how a narrative gets renamed.
- If the file could not be *read* when the dialog opened, the editor is read-only and the
  save leaves the file alone. An empty editor caused by an unreadable file must never be
  written over prose that is still there.

**Unlink** clears the reference and leaves the file, exactly as removing an image does. The
app never deletes a narrative; the folder is the user's.

## Schema

`Episode.NarrativeName` — a `required string`, empty for none, mirroring `ImageName`.

The validator requires it — `NotNull()`, matching the type. Newtonsoft ignores C#'s
`required`, so null is representable at runtime whatever the record says, and the validator
is where that gap is closed. **The project's standing preference is to keep properties
non-nullable and make the data match, rather than let null in and handle it everywhere.**

That is only affordable because both data files were brought up to the new key shape on
2026-08-30, before the rule was tightened:

- the real data file — `"narrativeName": ""` inserted after `imageName` in all 143 episodes
- `Pictura.Vita.Data/test/sample-01.json` — `imageName` *and* `narrativeName` added to all 47
  episodes, which also fixed a pre-existing bug: the sample carried no `imageName` at all, so
  `ImageName`'s own `NotNull()` made every episode in it unsaveable with a 400

Both edits were text insertions rather than JSON round trips, so each diff is added lines and
nothing else.

**This closes the write path only.** A file edited by hand, or an old backup restored, still
deserializes a missing property as null and hands it to the client on `GET` — nothing
validates a read. The `?? ''` coercions in `api/adapter.ts`, `EpisodeDialog` and
`CategoryDialog` remain load-bearing for exactly that case, and should not be removed on the
strength of the validator.

If this application is ever distributed and has to stay backwards-compatible with files it
did not write, that is the point at which a newly added property has to become genuinely
nullable. Until then the data is under this project's control and can simply be kept in
shape.

`SourceReaderService` reads no narrative column and never will — the workbook is history
(see `data-store.md`), so `TransformerService` writes `NarrativeName` as empty.

## Not built

- No narrative on a category or on the timeline itself. Episodes are where the anecdotes are.
- Nothing in the layout module. Unlike an image, a narrative has no rendered width and no
  threshold; the timeline bars are unchanged.
- No delete. Unlinking is reversible and deleting is not, and the folder is a folder.
- Export still covers the JSON only, as it did for images. The narratives directory is
  copied the way the images directory is: by copying the timeline's folder.
