using dotenv.net;
using JsonFlatFileDataStore;
using Microsoft.AspNetCore.Mvc;
using Pictura.Vita.Api.Validators;
using Scalar.AspNetCore;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<CategoryValidator>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("Pictura Vita API")
            .WithDarkMode(false);
    });
}

app.UseHttpsRedirection();

var timelineProvider = new TimelineProvider(new DataStore(Environment.GetEnvironmentVariable("DATA_FILE_PATH")));

// timeline endpoints

app.MapGet("/timelines", async () => await timelineProvider.GetAllAsync())
    .WithDisplayName("Get all timelines")
    .WithOpenApi()
    .Produces<IEnumerable<Timeline>>();

app.MapGet("/timeline/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var timeline = await timelineProvider.GetAsync(id);
        return timeline is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(timeline.Value);
    })
    .WithDisplayName("Get a timeline by ID")
    .WithOpenApi()
    .Produces<Timeline>()
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/timeline", async (
        [FromServices]TimelineInfoValidator validator,
        [FromBody]Timeline request
        ) =>
    {
        var validationResult = await validator
            .ValidateAsync(request.TimelineInfo);

        if (!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var updateResult = await timelineProvider.UpdateTimelineInfoAsync(request);

        return updateResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Update a timeline's information")
    .WithOpenApi()
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

// category endpoints

app.MapGet("/categories/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var categories = await timelineProvider.GetCategoriesAsync(id);

        return categories is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(categories.Value);
    })
    .WithDisplayName("Get all categories for a timeline")
    .WithOpenApi()
    .Produces<IEnumerable<Category>>()
    .Produces(StatusCodes.Status404NotFound);

app.MapGet("/category/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var category = await timelineProvider.GetCategoryAsync(id);

        return category is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(category.Value);
    })
    .WithDisplayName("Get a category by ID")
    .WithOpenApi()
    .Produces<Category>()
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/category", async (
        [FromServices]InsertCategoryRequestValidator validator,
        [FromBody]InsertCategoryRequest request
        ) =>
    {
        var validationResult = await validator.ValidateAsync(request);

        if (!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var newCategory = await timelineProvider.InsertCategoryAsync(request);

        return newCategory is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.CreatedAtRoute($"/categories/{newCategory.Value.CategoryId}");
    })
    .WithDisplayName("Create a new category")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

app.MapPut("/category", async (
        [FromServices]UpdateCategoryRequestValidator validator,
        [FromBody]UpdateCategoryRequest request
        ) =>
    {
        var validationResult = await validator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var updateResult = await timelineProvider.UpdateCategoryAsync(request);

        return updateResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Update a category")
    .WithOpenApi()
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

// episode endpoints

app.MapGet("/episodes/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var episode = await timelineProvider.GetEpisodeAsync(id);

        return episode is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(episode.Value);
    })
    .WithDisplayName("Get an episode by ID")
    .WithOpenApi()
    .Produces<Episode>()
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/episode", async (
        [FromServices]InsertEpisodeRequestValidator validator,
        [FromBody]InsertEpisodeRequest request
        ) =>
    {
        var validationResult = await validator.ValidateAsync(request);
        if(!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var newEpisode = await timelineProvider.InsertEpisodeAsync(request);

        return newEpisode is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.CreatedAtRoute($"/episodes/{newEpisode.Value.EpisodeId}");
    })
    .WithDisplayName("Create a new episode")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

app.MapPut("/episode", async (
        [FromServices]UpdateEpisodeRequestValidator validator,
        [FromBody]UpdateEpisodeRequest request
        ) =>
    {
        var validationResult = await validator.ValidateAsync(request);
        if(!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var updateResult = await timelineProvider.UpdateEpisodeAsync(request);

        return updateResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Update an episode")
    .WithOpenApi()
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

app.Run();

