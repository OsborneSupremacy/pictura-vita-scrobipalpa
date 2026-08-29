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
