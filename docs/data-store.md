# Where the data lives

Updated 2026-09-02.

## One folder per timeline

A timeline is a directory named for its id, and everything belonging to that timeline is
inside it:

```
<timelines root>/
  01979e65-0ab5-7a48-85d5-968f1be9f671/
    data.v1.json        the episodes, the categories and the timeline info
    images/             the episode pictures (see image-support.md)
    narratives/         the long-form prose (see narrative-support.md)
  0197a1c3-…/
    data.v1.json
    images/
    narratives/
```

`TIMELINES_ROOT_PATH` in the API's `.env` points at the root. It never leaves the machine.

Copying that folder copies the timeline entire — the dates, the pictures and the writing —
and deleting it touches nothing else. That is the whole point of the shape, and it is a change:
until 2026-09-02 there was a single `timeline-data.json` holding *every* timeline in one array,
with `images/<timeline id>/` and `narratives/<timeline id>/` as sibling directories. Moving one
timeline out of that meant extracting one element from a shared file by hand and then hunting
down two subdirectories.

### The folder name is the identity

`timelines/<id>/images` is a pure function of the id, so nothing has to scan the disk to work
out where a timeline's files are. The `timelineId` inside `data.v1.json` has to agree with the
folder holding it; a file that disagrees is refused with an error saying so, rather than being
reported as missing — "not found" would invite a caller to write over it.

So a folder duplicated under a new name does not become a second timeline. To genuinely fork
one, change the id in the file *and* the folder name to match.

### There is no index file

The table of contents lists what is actually in the directory. Nothing registers a timeline
anywhere, which is what makes "drop the folder in" work — a backup restored, a timeline someone
handed over, a folder pulled out of Time Machine. An index would be a second source of truth
and the first thing to go stale.

The listing does cost a parse of every timeline, so `TimelineProvider` keeps the summaries in
memory, keyed on each data file's last-write time and length. That is a cache with no
invalidation problem: a file that changed on disk fails the check and is re-read, whoever
changed it.

### `data.v1.json`

The version is in the filename rather than a field inside, so a future migration can write the
new file beside the old one and a directory listing shows at a glance which shape a timeline
is in.

The file is one `Timeline` record at the root — `timelineId`, `timelineInfo`, `episodes`,
`categories` — read and written by `TimelineFileStore` with System.Text.Json: camelCase names,
enums as integers, dates as `1930-12-15`, indented. It replaced `JsonFlatFileDataStore`, which
carried a `{ "timeline": [ … ] }` collection wrapper that means nothing once a file holds one
timeline, and which read through Newtonsoft — so `RespectNullableAnnotations`, the setting that
stops a JSON null landing in a non-nullable `required string`, could not reach the data. One
serializer now covers the HTTP boundary and the file.

### Writes

Every mutation is read → transform → write, under a lock held per timeline, and the write is
atomic: the JSON goes to a temporary file in the same folder and is then moved over the
destination. An interrupted write leaves the previous file intact rather than a truncated one.

The records are immutable, so a transform produces a new `Timeline` rather than editing a
shared one; nothing is visible to another request until the file has actually been replaced.
The previous store worked the other way round — it mutated the cached object first and wrote
afterwards, so a failed write still left the change sitting in memory.

## Migrating from the single file

`Pictura.Vita.Migration` reads the old `timeline-data.json`, along with `images/<id>/` and
`narratives/<id>/` beside it, and writes the folders out.

```bash
DATA_FILE_PATH=/path/to/timeline-data.json TIMELINES_ROOT_PATH=/tmp/pv-migrated dotnet run --project src/Pictura.Vita.Migration
```

That is a dry run: it reports what it would do and writes nothing. Add `-- --commit` to write.

Nothing under the source directory is moved, rewritten or deleted, ever. Files are **copied**.
A complete personal timeline is identity-verification-grade data, and until the new tree has
been opened in the app and looked at, the old one is the only copy — removing it is a decision
for a person, taken afterwards, by hand. The tool also refuses to write into a folder that
already holds a `data.v1.json`, so a second run stops rather than overwriting the first.

An export bundle downloaded from the app restores through the same tool: it is the same shape.

## Backups

The complete backup is a copy of the timelines directory. Images and narratives are files, and
no JSON export can carry them.

The app's export is a convenience on top of that: one file holding every timeline whole,
readable in any text editor, restorable through the migration tool. It carries no pictures and
no prose.

## Editing

Episodes, categories and timeline info are edited in the app, through the API, which writes
that timeline's `data.v1.json` in place. Images too: dropping, pasting or choosing a picture in
the episode dialog uploads it, and the API re-encodes it (stripping EXIF), names it and writes
it into the timeline's `images/` folder. Copying files in by hand still works — the store holds
a name, and it does not care who put the file there.

New timelines are created in the app, from the table of contents. The id is the server's to
choose, because the id names the folder.

A new timeline arrives with a set of default categories chosen for its subject — a person gets
one spine, an organisation another (`Pictura.Vita.Domain.DefaultCategories`). It has no
episodes, and a timeline with no categories draws nothing whatever you put in it, so the
alternative is a first run that asks you to invent a filing system before you have anything to
file. They are a starting point, not a schema: rename, reorder or delete them in the categories
dialog. An unused one is invisible on the timeline — the layout drops any band holding no
episodes — so nothing is cluttered by a default you never take up.

## The spreadsheet is history

Until 2026-08-30 the Excel workbook `data.xlsx` was authoritative and the JSON was a derived
artifact regenerated by `Pictura.Vita.Excel.Importer`. That is no longer true. The workbook is
the thing the project grew out of, kept for reference, not maintained as the live copy.

`Pictura.Vita.Excel.Importer` still builds and still works, but running it against your real
timelines is **destructive**.

It ends in `TimelineProvider.UpsertAsync`, which replaces the timeline sharing its id — and
the id is derived deterministically from the workbook's path, so a re-import always lands on
the folder already there. Everything the workbook has no column for is written back as the
importer's default and lost:

- every `imageName` (the workbook has no image column, and now never will)
- every `narrativeName`, orphaning the files in `narratives/` (see `narrative-support.md`)
- every category `icon` and `color`, which the importer writes as empty
- every `confidentiality` level, which the importer writes as `OnlyMe`
- every edit made in the app since the last import

The `images/` and `narratives/` folders themselves are untouched; their files simply stop being
referenced by anything.

So treat it as a one-off migration tool that has already done its job. If it is ever needed
again — importing a *different* spreadsheet as a *new* timeline, say — point
`TIMELINES_ROOT_PATH` at a scratch directory first:

```bash
TIMELINES_ROOT_PATH=/tmp/scratch dotnet run --project src/Pictura.Vita.Excel.Importer
```

The `ImageName` column the importer reads (column 9) is vestigial for the same reason. It
stays because removing it would only make the reader disagree with the domain model, and
costs nothing where the column is absent — a blank cell reads as "no image". There is no
narrative column at all; the importer writes `NarrativeName` as empty.
