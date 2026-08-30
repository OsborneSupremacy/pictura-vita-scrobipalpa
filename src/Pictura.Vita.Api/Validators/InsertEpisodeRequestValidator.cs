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
        // Empty means "no narrative"; anything else has to be a bare Markdown file name, for
        // the same reason ImageName is checked here — a name that could escape the narrative
        // root must not reach the store at all.
        //
        // NotNull() matches the `required string` on the domain model. JsonFlatFileDataStore
        // reads through Newtonsoft, which ignores C#'s `required`, so null is representable
        // at runtime whatever the type says; this is where that gap is closed. It closes it
        // on the *write* path only — a hand-edited file, or an old backup restored, still
        // deserializes a missing property as null and hands it to the client on GET, which is
        // why the coercions in the client's adapter and dialogs are still load-bearing.
        RuleFor(x => x.NarrativeName)
            .NotNull()
            .Must(name => string.IsNullOrEmpty(name) || NarrativeFileName.IsValid(name))
            .WithMessage("NarrativeName must be a bare file name ending in .md, or be empty for no narrative.");
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