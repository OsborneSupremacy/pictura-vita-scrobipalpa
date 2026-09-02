using System.Text.Json;
using dotenv.net;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;
using Spectre.Console;

// One-shot migration from the shared data file to one directory per timeline.
//
// Before:                                  After:
//   <dir>/timeline-data.json                 <root>/<timeline id>/data.v1.json
//   <dir>/images/<timeline id>/              <root>/<timeline id>/images/
//   <dir>/narratives/<timeline id>/          <root>/<timeline id>/narratives/
//
// Nothing in the source directory is read-write opened, moved or deleted — ever. A complete
// personal timeline is identity-verification-grade data (see the README), and until the new
// tree has been opened in the app and looked at, the old one is the only copy. Removing it is
// a decision for a person, taken afterwards, by hand.

DotEnv.Load(new DotEnvOptions(overwriteExistingVars: false));

var commit = args.Contains("--commit", StringComparer.OrdinalIgnoreCase);

var dataFilePath = Environment.GetEnvironmentVariable("DATA_FILE_PATH");
var timelinesRoot = Environment.GetEnvironmentVariable("TIMELINES_ROOT_PATH");

if (string.IsNullOrWhiteSpace(dataFilePath) || !File.Exists(dataFilePath))
{
    AnsiConsole.MarkupLine(
        "[red]DATA_FILE_PATH is not set or does not exist:[/] {0}",
        Markup.Escape(dataFilePath ?? "(unset)"));
    AnsiConsole.MarkupLine("Point it at the [yellow]timeline-data.json[/] you are migrating from.");
    return 1;
}

if (string.IsNullOrWhiteSpace(timelinesRoot))
{
    AnsiConsole.MarkupLine("[red]TIMELINES_ROOT_PATH is not set.[/]");
    AnsiConsole.MarkupLine(
        "Point it at the directory the timelines should be written into. Use a scratch "
        + "directory first and look at the result before you point the API at it.");
    return 1;
}

var sourceDirectory = Path.GetDirectoryName(Path.GetFullPath(dataFilePath))!;
var sourceImages = Path.Combine(sourceDirectory, "images");
var sourceNarratives = Path.Combine(sourceDirectory, "narratives");

AnsiConsole.MarkupLine("Reading  [green]{0}[/]", Markup.Escape(Path.GetFullPath(dataFilePath)));
AnsiConsole.MarkupLine("Writing  [green]{0}[/]", Markup.Escape(Path.GetFullPath(timelinesRoot)));
AnsiConsole.MarkupLine(
    commit
        ? "[yellow]--commit given: this run will write.[/]"
        : "[blue]Dry run.[/] Nothing will be written. Re-run with [yellow]--commit[/] to do it.");
AnsiConsole.WriteLine();

List<Timeline> timelines;

try
{
    timelines = ReadOldStore(dataFilePath);
}
catch (JsonException exception)
{
    // Read with the same strictness the new store uses, so a null sitting in a property the
    // domain says is non-nullable stops the migration here rather than being copied forward to
    // fail on the first read afterwards. The message names the property and the offset.
    AnsiConsole.MarkupLine("[red]{0} could not be read.[/]", Markup.Escape(dataFilePath));
    AnsiConsole.MarkupLine(Markup.Escape(exception.Message));
    return 1;
}

if (timelines.Count == 0)
{
    AnsiConsole.MarkupLine("[yellow]The data file holds no timelines. Nothing to do.[/]");
    return 0;
}

// Checked before anything is written, so a run that would collide stops with the destination
// untouched rather than half migrated.
var occupied = timelines
    .Select(t => Path.Combine(timelinesRoot, t.TimelineId.ToString(), TimelineFileStore.DataFileName))
    .Where(File.Exists)
    .ToList();

if (occupied.Count > 0)
{
    AnsiConsole.MarkupLine("[red]The destination already holds these timelines:[/]");
    foreach (var path in occupied)
        AnsiConsole.MarkupLine("  {0}", Markup.Escape(path));
    AnsiConsole.MarkupLine(
        "Migrate into an empty directory, or move these aside first. Overwriting a timeline "
        + "that is already there is not something this tool will do.");
    return 1;
}

var store = new TimelineFileStore(timelinesRoot);

var table = new Table().Border(TableBorder.Rounded);
table.AddColumn("Timeline");
table.AddColumn("Title");
table.AddColumn("Episodes", column => column.RightAligned());
table.AddColumn("Categories", column => column.RightAligned());
table.AddColumn("Images", column => column.RightAligned());
table.AddColumn("Narratives", column => column.RightAligned());

foreach (var timeline in timelines)
{
    var id = timeline.TimelineId;
    var destination = store.DirectoryFor(id);

    var images = CopyBeside(Path.Combine(sourceImages, id.ToString()),
        Path.Combine(destination, TimelineFileStore.ImagesDirectoryName));

    var narratives = CopyBeside(Path.Combine(sourceNarratives, id.ToString()),
        Path.Combine(destination, TimelineFileStore.NarrativesDirectoryName));

    if (commit)
    {
        var written = await store.WriteAsync(timeline);

        if (written.IsFaulted)
        {
            AnsiConsole.Write(table);
            AnsiConsole.MarkupLine("[red]{0}[/]", Markup.Escape(written.Exception.Message));
            return 1;
        }
    }

    table.AddRow(
        id.ToString(),
        Markup.Escape(timeline.TimelineInfo.Title),
        timeline.Episodes.Count.ToString(),
        timeline.Categories.Count.ToString(),
        images.ToString(),
        narratives.ToString());
}

AnsiConsole.Write(table);
AnsiConsole.WriteLine();

if (commit)
{
    AnsiConsole.MarkupLine(
        "[green]Done.[/] Open the new tree in the app and check it before you delete anything. "
        + "Nothing under {0} was touched.",
        Markup.Escape(sourceDirectory));
}
else
{
    AnsiConsole.MarkupLine("[blue]Dry run complete.[/] Re-run with [yellow]--commit[/] to write.");
}

return 0;

// Reads the pre-migration store: one JSON object whose single property is the array of
// timelines JsonFlatFileDataStore kept them in.
static List<Timeline> ReadOldStore(string path)
{
    using var document = JsonDocument.Parse(File.ReadAllText(path));

    var collection = document.RootElement
        .EnumerateObject()
        .FirstOrDefault(property => property.Value.ValueKind == JsonValueKind.Array);

    if (collection.Value.ValueKind != JsonValueKind.Array)
        throw new JsonException(
            "The file holds no array of timelines. Expected something shaped like "
            + "{ \"timeline\": [ … ] }.");

    var options = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        RespectNullableAnnotations = true
    };

    return collection.Value.Deserialize<List<Timeline>>(options) ?? [];
}

// Copies a directory's files, without recursing: images and narratives are flat directories of
// files, and anything nested under them was not put there by this application.
int CopyBeside(string from, string to)
{
    // Created even when there is nothing to copy, so every migrated timeline has the same
    // shape as one the app creates: a folder that shows what belongs in it.
    if (commit) Directory.CreateDirectory(to);

    if (!Directory.Exists(from)) return 0;

    var files = Directory.GetFiles(from);

    if (!commit) return files.Length;

    foreach (var file in files)
        File.Copy(file, Path.Combine(to, Path.GetFileName(file)), overwrite: false);

    return files.Length;
}
