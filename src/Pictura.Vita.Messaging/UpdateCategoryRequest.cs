namespace Pictura.Vita.Messaging;

public record UpdateCategoryRequest
{
    public required Guid TimelineId { get; init; }

    public required Category Category { get; init; }
}