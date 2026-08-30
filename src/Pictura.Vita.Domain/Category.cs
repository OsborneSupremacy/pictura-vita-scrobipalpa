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

    /// <summary>
    /// Name of the icon shown beside the category, in Lucide's kebab-case form
    /// (for example "graduation-cap"). Empty for no icon.
    ///
    /// The canonical kebab name is stored rather than a binding-specific identifier, so the
    /// value still means something to any other Lucide integration — or to a person reading
    /// the file.
    /// </summary>
    public required string Icon { get; init; }
}
