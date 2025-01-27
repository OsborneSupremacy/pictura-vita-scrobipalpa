namespace Pictura.Vita.Excel.Importer.Models;

internal record Occurrence
{
    public required string Headline { get; init; }

    public required string Description1 { get; init; }

    public required string Description2 { get; init; }

    public required string Url { get; init; }

    public required string UrlDescription { get; init; }

    public required DateOnly StartDate { get; init; }

    public required DateOnly EndDate { get; init; }

    public required string Group { get; init; }
}