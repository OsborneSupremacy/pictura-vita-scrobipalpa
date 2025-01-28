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

    public required DateOnly End { get; init; }

    /// <summary>
    /// Duration in days
    /// </summary>
    public required int Duration { get; init; }

    public required IList<Guid> CategoryIds { get; init; }
}