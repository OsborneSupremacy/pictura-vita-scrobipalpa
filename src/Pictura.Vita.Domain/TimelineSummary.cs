namespace Pictura.Vita.Domain;

public record TimelineSummary
{
    public required Guid TimelineId { get; init; }

    public required string Title { get; init; }
}