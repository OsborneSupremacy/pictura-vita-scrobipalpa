namespace Pictura.Vita.Api.Validators;

internal class TimelineSubjectValidator : AbstractValidator<TimelineSubject>
{
    public TimelineSubjectValidator()
    {
        RuleFor(x => x.SubjectType).NotNull();
        RuleFor(x => x.Organization).NotNull();
        RuleFor(x => x.Person).NotNull();

        // Both branches are always present on the record, but only the one the subject
        // type selects describes the timeline, so only that one is worth validating.
        RuleFor(x => x.Person)
            .SetValidator(new PersonValidator())
            .When(x => x.SubjectType == SubjectType.Person);
        RuleFor(x => x.Organization)
            .SetValidator(new OrganizationValidator())
            .When(x => x.SubjectType == SubjectType.Organization);
    }
}