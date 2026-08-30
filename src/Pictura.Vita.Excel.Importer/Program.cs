using dotenv.net;
using JsonFlatFileDataStore;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Excel.Importer.Services;
using Spectre.Console;

// Do not clobber variables already set in the environment: an explicit value from the
// shell must win over .env, or you cannot safely point this at a scratch file.
DotEnv.Load(new DotEnvOptions(overwriteExistingVars: false));

var skipInvalid = args.Contains("--skip-invalid", StringComparer.OrdinalIgnoreCase);

var sourceFile = Environment.GetEnvironmentVariable("SOURCE_EXCEL_FILE_PATH");
var dataFilePath = Environment.GetEnvironmentVariable("DATA_FILE_PATH");

if (string.IsNullOrWhiteSpace(sourceFile) || !File.Exists(sourceFile))
{
    AnsiConsole.MarkupLine("[red]SOURCE_EXCEL_FILE_PATH is not set or does not exist:[/] {0}", sourceFile ?? "(unset)");
    return 1;
}

if (string.IsNullOrWhiteSpace(dataFilePath))
{
    AnsiConsole.MarkupLine("[red]DATA_FILE_PATH is not set.[/] Copy .env.example to .env and set it.");
    return 1;
}

AnsiConsole.MarkupLine("Source: [green]{0}[/]", sourceFile);

var occurrences = SourceReaderService.ReadAll(sourceFile);
AnsiConsole.MarkupLine("Read [green]{0}[/] rows", occurrences.Count);

var problems = ValidationService.Validate(occurrences);

if (problems.Count > 0)
{
    var table = new Table().Border(TableBorder.Rounded);
    table.AddColumn("Row");
    table.AddColumn("Problem");
    foreach (var problem in problems)
        table.AddRow(problem.RowNumber.ToString(), Markup.Escape(problem.Problem));

    AnsiConsole.Write(table);

    if (!skipInvalid)
    {
        AnsiConsole.MarkupLine(
            "[red]{0} problem(s) found. Nothing was written.[/] Fix the spreadsheet, or re-run "
            + "with [yellow]--skip-invalid[/] to import the remaining rows.",
            problems.Count);
        return 1;
    }

    var skipped = occurrences.Count(o => !ValidationService.IsValid(o, problems));
    occurrences = occurrences.Where(o => ValidationService.IsValid(o, problems)).ToList();
    AnsiConsole.MarkupLine("[yellow]Skipping {0} invalid row(s).[/]", skipped);
}

var imageWarnings = ValidationService.ImageWarnings(occurrences);

if (imageWarnings.Count > 0)
{
    var table = new Table().Border(TableBorder.Rounded);
    table.AddColumn("Row");
    table.AddColumn("Image warning");
    foreach (var warning in imageWarnings)
        table.AddRow(warning.RowNumber.ToString(), Markup.Escape(warning.Problem));

    AnsiConsole.Write(table);
    AnsiConsole.MarkupLine(
        "[yellow]{0} image name(s) will be imported as no image.[/] The rows themselves are fine.",
        imageWarnings.Count);
}

var timeline = TransformerService.Transform(
    occurrences,
    sourceFile,
    DateOnly.FromDateTime(DateTime.Today));

var timelineProvider = new TimelineProvider(new DataStore(dataFilePath));
var replaced = await timelineProvider.UpsertAsync(timeline);

AnsiConsole.MarkupLine(
    "{0} timeline [green]{1}[/] ({2} episodes, {3} categories, {4} – {5}) in {6}",
    replaced ? "Replaced" : "Inserted",
    timeline.TimelineId,
    timeline.Episodes.Count,
    timeline.Categories.Count,
    timeline.TimelineInfo.Start.ToString("yyyy-MM-dd"),
    timeline.TimelineInfo.End.ToString("yyyy-MM-dd"),
    Markup.Escape(dataFilePath));

return 0;
