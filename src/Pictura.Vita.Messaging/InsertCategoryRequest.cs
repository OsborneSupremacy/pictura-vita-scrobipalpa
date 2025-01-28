namespace Pictura.Vita.Messaging;

public record InsertCategoryRequest
{
    public required Guid TimelineId { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required Confidentiality Confidentiality { get; init; }
}