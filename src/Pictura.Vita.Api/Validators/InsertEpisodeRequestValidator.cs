namespace Pictura.Vita.Api.Validators;

internal class InsertEpisodeRequestValidator : AbstractValidator<InsertEpisodeRequest>
{
    public InsertEpisodeRequestValidator()
    {
        RuleFor(x => x.TimelineId).NotEmpty();
        RuleFor(x => x.Confidentiality).NotNull();
        RuleFor(x => x.Title).NotEmpty();
        RuleFor(x => x.Subtitle).NotNull();
        RuleFor(x => x.Description).NotNull();
        RuleFor(x => x.Url).NotNull();
        RuleFor(x => x.UrlDescription).NotNull();
        RuleFor(x => x.StartPrecision).NotNull();
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.EndPrecision).NotNull();
        RuleFor(x => x.End).NotNull();
        RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start);
        RuleFor(x => x.CategoryIds)
            .Must(x => x.Count > 0)
            .WithMessage("Must have at least one category.");
    }
}