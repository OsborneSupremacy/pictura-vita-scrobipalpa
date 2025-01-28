namespace Pictura.Vita.Messaging;

public record UpdateEpisodeRequest
{
    public required Guid TimelineId { get; init; }

    public required Episode Episode { get; init; }
}