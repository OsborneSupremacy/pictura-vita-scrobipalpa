using System.Text.Json;
using System.Text.Json.Serialization;
using dotenv.net;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Excel.Importer.Services;
using Spectre.Console;

DotEnv.Load();

var sourceFile = Environment.GetEnvironmentVariable("SOURCE_EXCEL_FILE_PATH");

if (!File.Exists(sourceFile))
{
    AnsiConsole.WriteException(new FileNotFoundException($"Could not find file at {sourceFile}"));
    Environment.Exit(1);
}

AnsiConsole.MarkupLine("Using source file: [green]{0}[/]", sourceFile);

var occurrences = SourceReaderService.ReadAll(sourceFile);

AnsiConsole.MarkupLine("Found [green]{0}[/] occurrences", occurrences.Count);

var timeline = TransformerService.Transform(occurrences);

var timelineProvider = new TimelineProvider();
timelineProvider.InsertAsync(timeline).GetAwaiter().GetResult();

Environment.Exit(0);