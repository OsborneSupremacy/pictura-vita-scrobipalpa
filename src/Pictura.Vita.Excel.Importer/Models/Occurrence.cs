namespace Pictura.Vita.Excel.Importer.Models;

internal record Occurrence
{
    /// <summary>Spreadsheet row this came from, so problems can be reported by row.</summary>
    public required int RowNumber { get; init; }

    public required string Headline { get; init; }

    public required string Description1 { get; init; }

    public required string Description2 { get; init; }

    public required string Url { get; init; }

    public required string UrlDescription { get; init; }

    public required DateOnly StartDate { get; init; }

    public required DateOnly EndDate { get; init; }

    public required string Group { get; init; }

    /// <summary>
    /// True when the source row left the end date blank, meaning the occurrence is ongoing.
    /// </summary>
    public bool Indefinite => EndDate == DateOnly.MaxValue;

    /// <summary>
    /// Stable natural key for the row. Content-derived, so editing a headline or a date
    /// produces a new identity — the durable fix is an explicit id column in the source.
    /// </summary>
    public string NaturalKey => $"{Group}|{StartDate:yyyy-MM-dd}|{EndDate:yyyy-MM-dd}|{Headline}";
}
