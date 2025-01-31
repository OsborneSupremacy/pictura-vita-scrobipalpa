namespace Pictura.Vita.Domain;

public record TimelineInfo
{
    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required TimelineSubject TimelineSubject { get; init; }

    public required DateOnly Start { get; init; }

    public required DateOnly End { get; init; }
}