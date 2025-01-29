namespace Pictura.Vita.Api.Validators;

internal class TimelineSubjectValidator : AbstractValidator<TimelineSubject>
{
    public TimelineSubjectValidator()
    {
        RuleFor(x => x.SubjectType).NotNull();
        RuleFor(x => x.Organization).NotNull();
        RuleFor(x => x.Person).NotNull();
    }
}