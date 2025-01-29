namespace Pictura.Vita.Api.Validators;

internal class UpdateCategoryRequestValidator : AbstractValidator<UpdateCategoryRequest>
{
    public UpdateCategoryRequestValidator()
    {
        RuleFor(x => x.TimelineId).NotEmpty();
        RuleFor(x => x.Category).SetValidator(new CategoryValidator());
    }
}