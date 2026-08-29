namespace Pictura.Vita.Api.Validators;

internal class UpdateTimelineInfoRequestValidator : AbstractValidator<UpdateTimelineInfoRequest>
{
    public UpdateTimelineInfoRequestValidator()
    {
        RuleFor(x => x.TimelineId).NotEmpty();
        RuleFor(x => x.TimelineInfo).SetValidator(new TimelineInfoValidator());
    }
}
