namespace Pictura.Vita.Domain;

public record TimelineSubject
{
    public required SubjectType SubjectType { get; init; }

    public required Organization Organization { get; init; }

    public required Person Person { get; init; }
}
