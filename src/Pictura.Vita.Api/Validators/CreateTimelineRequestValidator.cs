namespace Pictura.Vita.Api.Validators;

internal class CreateTimelineRequestValidator : AbstractValidator<CreateTimelineRequest>
{
    public CreateTimelineRequestValidator(TimeProvider timeProvider)
    {
        // The same rules an edit is held to. A timeline that could not be saved after it was
        // created would be a strange thing to have let into the directory.
        RuleFor(x => x.TimelineInfo).SetValidator(new TimelineInfoValidator(timeProvider));
    }
}
