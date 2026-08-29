namespace Pictura.Vita.Api.Validators;

internal class EpisodeValidator : AbstractValidator<Episode>
{
    public EpisodeValidator()
    {
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
        RuleFor(x => x.End)
            .Equal(DateOnly.MaxValue)
            .When(x => x.Indefinite)
            .WithMessage("An indefinite episode must have an end date of 9999-12-31.");
        RuleFor(x => x.End)
            .NotEqual(DateOnly.MaxValue)
            .When(x => !x.Indefinite)
            .WithMessage("An episode with a known end must not use 9999-12-31 as its end date.");
        RuleFor(x => x.CategoryIds)
            .Must(x => x.Count > 0)
            .WithMessage("Must have at least one category.");
    }
}