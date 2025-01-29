namespace Pictura.Vita.Api.Validators;

internal class CategoryValidator : AbstractValidator<Category>
{
    public CategoryValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Title).NotEmpty();
        RuleFor(x => x.Subtitle).NotNull();
        RuleFor(x => x.Confidentiality).NotNull();
        RuleFor(x => x.Confidentiality)
            .NotEqual(Confidentiality.Inherit)
            .WithMessage("A category cannot inherit confidentiality.");
    }
}