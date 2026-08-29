namespace Pictura.Vita.Domain;

public record Category
{
    public required Guid CategoryId { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required Confidentiality Confidentiality { get; init; }

    /// <summary>
    /// The order in which this category's band is drawn on the timeline, ascending.
    /// </summary>
    public required int SortOrder { get; init; }
}
