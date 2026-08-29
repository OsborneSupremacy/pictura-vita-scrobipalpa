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
        RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start);
        RuleFor(x => x.End)
            .Equal(DateOnly.MaxValue)
            .When(x => x.Ongoing)
            .WithMessage("An ongoing timeline must have an end date of 9999-12-31.");
        RuleFor(x => x.End)
            .NotEqual(DateOnly.MaxValue)
            .When(x => !x.Ongoing)
            .WithMessage("A timeline that is not ongoing must have a real end date.");
    }
}