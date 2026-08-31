namespace Pictura.Vita.Api.Validators;

internal class CategoryValidator : AbstractValidator<Category>
{
    public CategoryValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Title).NotEmpty();
        RuleFor(x => x.Subtitle).NotNull();
        RuleFor(x => x.Description).NotNull();
        RuleFor(x => x.Description)
            .MaximumLength(Category.MaxDescriptionLength)
            .WithMessage($"A description is limited to {Category.MaxDescriptionLength} characters.");
        RuleFor(x => x.Confidentiality).NotNull();
        RuleFor(x => x.Confidentiality)
            .NotEqual(Confidentiality.Inherit)
            .WithMessage("A category cannot inherit confidentiality.");
        RuleFor(x => x.SortOrder)
            .GreaterThanOrEqualTo(0);
        RuleFor(x => x.Icon).NotNull();
        RuleFor(x => x.Color).NotNull();
        RuleFor(x => x.Color)
            .Matches("^#[0-9a-fA-F]{6}$")
            .When(x => !string.IsNullOrEmpty(x.Color))
            .WithMessage("Colour must be a six-digit hex value such as #1e5799.");
    }
}