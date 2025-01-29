namespace Pictura.Vita.Api.Validators;

internal class UpdateEpisodeRequestValidator : AbstractValidator<UpdateEpisodeRequest>
{
    public UpdateEpisodeRequestValidator()
    {
        RuleFor(x => x.TimelineId).NotEmpty();
        RuleFor(x => x.Episode).SetValidator(new EpisodeValidator());
    }
}