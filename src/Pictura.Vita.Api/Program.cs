using dotenv.net;
using JsonFlatFileDataStore;
using Microsoft.AspNetCore.Mvc;
using Pictura.Vita.Api.Validators;
using Scalar.AspNetCore;

// Do not clobber variables already set in the environment: an explicit value from the
// shell must win over .env, or you cannot safely point this at a scratch file.
DotEnv.Load(new DotEnvOptions(overwriteExistingVars: false));

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
// includeInternalTypes: the validators are internal, and the scanner skips internal types
// by default. Without this every endpoint that resolves a validator fails at request time
// with "No service for type ... has been registered".
builder.Services.AddValidatorsFromAssemblyContaining<CategoryValidator>(includeInternalTypes: true);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("Pictura Vita API");
    });
}

app.UseHttpsRedirection();

var dataFilePath = Environment.GetEnvironmentVariable("DATA_FILE_PATH");

// Fail loudly at startup rather than serving an empty store: a data file that is missing or
// misconfigured otherwise looks identical to a timeline with nothing in it.
if (string.IsNullOrWhiteSpace(dataFilePath))
    throw new InvalidOperationException(
        "DATA_FILE_PATH is not set. Copy .env.example to .env in the API project and point "
        + "DATA_FILE_PATH at your timeline JSON file.");

if (!File.Exists(dataFilePath))
    throw new InvalidOperationException(
        $"DATA_FILE_PATH points at \"{dataFilePath}\", which does not exist. Check the path in "
        + "the API project's .env file, or run the Excel importer to generate it.");

var dataStore = new DataStore(dataFilePath);
var timelineProvider = new TimelineProvider(dataStore);
var randomTimelineProvider = new RandomTimelineProvider();

// timeline endpoints
app.MapGet("/timelinesummaries", async () =>
    {
        var summaries = await timelineProvider.GetAllSummariesAsync();
        return Results.Ok(summaries);
    })
    .WithDisplayName("Get all timeline summaries")
    .Produces<IEnumerable<TimelineSummary>>();

app.MapGet("/timelines", async () => await timelineProvider.GetAllAsync())
    .WithDisplayName("Get all timelines")
    .Produces<IEnumerable<Timeline>>();

app.MapGet("/timelines/random", () =>
    {
        var timeline = randomTimelineProvider.Generate();
        List<Timeline> timelines = [ timeline ];
        return Results.Ok(timelines);
    })
    .WithDisplayName("Get random timelines")
    .Produces<IEnumerable<Timeline>>();

app.MapGet("/timeline/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var timeline = await timelineProvider.GetAsync(id);
        return timeline is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(timeline.Value);
    })
    .WithDisplayName("Get a timeline by ID")
    .Produces<Timeline>()
    .Produces(StatusCodes.Status404NotFound);

app.MapGet("/timeline/random", () =>
    {
        var timeline = randomTimelineProvider.Generate();
        return Results.Ok(timeline);
    })
    .WithDisplayName("Get a random timeline")
    .Produces<Timeline>();

// Takes only the information being changed. It previously accepted a whole Timeline, which
// meant sending every episode back to the server to rename the subject.
app.MapPut("/timeline", async (
        [FromServices]UpdateTimelineInfoRequestValidator validator,
        [FromBody]UpdateTimelineInfoRequest request
        ) =>
    {
        var validationResult = await validator.ValidateAsync(request);

        if (!validationResult.IsValid)
            return Results.ValidationProblem(validationResult.ToDictionary());

        var updateResult = await timelineProvider.UpdateTimelineInfoAsync(request);

        return updateResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Update a timeline's information")
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
            : Results.Created($"/category/{newCategory.Value.CategoryId}", newCategory.Value);
    })
    .WithDisplayName("Create a new category")
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
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

app.MapDelete("/category/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var deleteResult = await timelineProvider.DeleteCategoryAsync(id);

        return deleteResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Delete a category")
    .Produces(StatusCodes.Status204NoContent)
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
            : Results.Created($"/episodes/{newEpisode.Value.EpisodeId}", newEpisode.Value);
    })
    .WithDisplayName("Create a new episode")
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
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

app.Run();

