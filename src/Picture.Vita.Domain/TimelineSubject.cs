namespace Picture.Vita.Domain;

public record TimelineSubject
{
    public required SubjectType SubjectType { get; set; }

    public required Organization Organization { get; set; }

    public required Person Person { get; set; }
}
