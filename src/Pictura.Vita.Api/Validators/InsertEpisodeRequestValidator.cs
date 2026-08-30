using Pictura.Vita.Utility;

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
        // Empty means "no image"; anything else has to be a bare, servable file name. Rejecting
        // it here keeps a name that could never resolve — or could escape the image root — from
        // reaching the store in the first place.
        RuleFor(x => x.ImageName)
            .NotNull()
            .Must(name => string.IsNullOrEmpty(name) || ImageFileName.IsValid(name))
            .WithMessage(
                "ImageName must be a bare file name ending in "
                + ".jpg, .jpeg, .png, .webp or .gif, or be empty for no image.");
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