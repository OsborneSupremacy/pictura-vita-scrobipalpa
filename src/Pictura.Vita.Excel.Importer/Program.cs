using System.Text.Json;
using System.Text.Json.Serialization;
using dotenv.net;
using Pictura.Vita.Domain;
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

// serialize timeline to json

var options = new JsonSerializerOptions
{
    WriteIndented = true,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
};

List<Timeline> timelines = [ timeline];

var timelinesJson = JsonSerializer.Serialize(timelines, options);

// write to file in temp directory
var tempFile = Path.Combine(Path.GetTempPath(), $"{Environment.UserName}-timeline.json");

// delete if exists
if (File.Exists(tempFile))
    File.Delete(tempFile);

File.WriteAllText(tempFile, timelinesJson);

AnsiConsole.MarkupLine("Timeline JSON written to [green]{0}[/]", tempFile);

Environment.Exit(0);