namespace Pictura.Vita.Messaging;

public record UpdateTimelineInfoRequest
{
    public required Guid TimelineId { get; init; }

    public required TimelineInfo TimelineInfo { get; init; }
}
