namespace Pictura.Vita.Api.Validators;

internal class TimelineInfoValidator : AbstractValidator<TimelineInfo>
{
    public TimelineInfoValidator()
    {
        RuleFor(x => x.Title).NotEmpty();
        RuleFor(x => x.Subtitle).NotNull();
        RuleFor(x => x.TimelineSubject).NotNull();
        RuleFor(x => x.TimelineSubject).SetValidator(new TimelineSubjectValidator());
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.End).NotNull();
    }
}