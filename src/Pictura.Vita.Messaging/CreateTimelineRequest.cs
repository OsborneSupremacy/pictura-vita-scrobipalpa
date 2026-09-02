namespace Pictura.Vita.Messaging;

/// <summary>
/// Body of a timeline creation.
///
/// Only the information — a new timeline has no episodes and no categories, and its id is the
/// server's to choose: the id names the directory the timeline lives in, so letting a caller
/// pick it would let a caller pick a directory.
/// </summary>
public record CreateTimelineRequest
{
    public required TimelineInfo TimelineInfo { get; init; }
}
