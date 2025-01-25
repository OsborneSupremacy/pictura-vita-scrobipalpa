namespace Picture.Vita.Domain;

public record Timeline
{
    public required string Title { get; set; }

    public required string Subtitle { get; set; }

    public required TimelineSubject TimelineSubject { get; set; }

    public required DateOnly Start { get; set; }

    public required DateOnly End { get; set; }

    public required IList<Episode> Episodes { get; set; }

    public required IList<Category> Categories { get; set; }
}
