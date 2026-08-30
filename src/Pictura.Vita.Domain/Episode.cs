namespace Pictura.Vita.Domain;

public record Episode
{
    public required Guid EpisodeId { get; init; }

    public required Confidentiality Confidentiality { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required string Description { get; init; }

    public required string Url { get; init; }

    public required string UrlDescription { get; init; }

    /// <summary>
    /// File name of the episode's image, for example "kalamazoo-house.jpg". Empty for none.
    ///
    /// Only the name is stored; the bytes live on disk under the image root (see
    /// docs/image-support.md), which keeps the store portable and out of the business of
    /// carrying binary data. A name that resolves to no file is not an error — it draws as
    /// no image, exactly like an episode that never had one.
    /// </summary>
    public required string ImageName { get; init; }

    /// <summary>
    /// File name of the episode's narrative — the long-form Markdown account of it, for
    /// example "moving-to-kalamazoo.md". Empty for none.
    ///
    /// Like <see cref="ImageName"/>, only the name is stored; the text lives on disk under
    /// the narrative root (see docs/narrative-support.md). Prose runs to thousands of words,
    /// which a JSON field holds only as one escaped line — unreadable in a diff, rewritten
    /// whole on every save, and impossible to open in an editor of your own. A name that
    /// resolves to no file is not an error: the episode simply offers nothing to read.
    ///
    /// This does not replace <see cref="Description"/>, which stays the short summary shown
    /// in the detail panel.
    /// </summary>
    public required string NarrativeName { get; init; }

    public required EpisodeType EpisodeType { get; init; }

    public required DatePrecision StartPrecision { get; init; }

    public required DateOnly Start { get; init; }

    public required DatePrecision EndPrecision { get; init; }

    /// <summary>
    /// The end of the episode. When <see cref="Indefinite"/> is true this is
    /// <see cref="DateOnly.MaxValue"/> and carries no meaning beyond "no known end".
    /// </summary>
    public required DateOnly End { get; init; }

    /// <summary>
    /// True when the episode is ongoing and has no known end date. Indefinite episodes
    /// are drawn as running past the end of the timeline.
    /// </summary>
    public required bool Indefinite { get; init; }

    public required IList<Guid> CategoryIds { get; init; }
}
