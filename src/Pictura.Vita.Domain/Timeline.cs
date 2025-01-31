namespace Pictura.Vita.Domain;

public record Timeline
{
    public required Guid TimelineId { get; init; }

    public required TimelineInfo TimelineInfo { get; init; }

    public required IList<Episode> Episodes { get; init; }

    public required IList<Category> Categories { get; init; }
}
