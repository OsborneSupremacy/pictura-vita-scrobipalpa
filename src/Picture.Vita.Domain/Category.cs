namespace Picture.Vita.Domain;

public record Category
{
    public required Guid CategoryId { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required IList<Guid> EpisodeIds { get; init; }

    public required Confidentiality Confidentiality { get; init; }
}