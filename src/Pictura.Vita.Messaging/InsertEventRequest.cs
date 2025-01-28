namespace Pictura.Vita.Messaging;

public record InsertEventRequest
{
    public required Guid TimelineId { get; init; }

    public required Episode Episode { get; init; }
}