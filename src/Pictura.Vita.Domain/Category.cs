namespace Pictura.Vita.Domain;

public record Category
{
    /// <summary>
    /// Longest description accepted, in characters. A description is a paragraph of context
    /// for the band, not an essay — an episode's long-form account is a narrative file. The
    /// limit lives here so the validator and the data agree on one number.
    /// </summary>
    public const int MaxDescriptionLength = 500;

    public required Guid CategoryId { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    /// <summary>
    /// A paragraph shown under the category's name on the timeline, saying what the band
    /// covers. Empty for none, never null — see docs/data-store.md on keeping the data in
    /// shape rather than reaching for nullable properties.
    /// </summary>
    public required string Description { get; init; }

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

    /// <summary>
    /// The band's colour as a six-digit hex value, for example "#1e5799". Empty means the
    /// colour is chosen automatically from the band's position.
    ///
    /// One base colour is stored rather than a gradient and a text colour: both are derived
    /// when drawing, so the look can change without rewriting anyone's data.
    /// </summary>
    public required string Color { get; init; }
}
