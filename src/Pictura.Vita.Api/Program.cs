using dotenv.net;
using Microsoft.AspNetCore.Mvc;
using Scalar.AspNetCore;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

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

var timelineProvider = new TimelineProvider();

// timeline endpoints

app.MapGet("/timelines", async () => await timelineProvider.GetAllAsync())
    .WithDisplayName("Get all timelines")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK);

app.MapGet("/timeline/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var timeline = await timelineProvider.GetAsync(id);
        return timeline is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(timelineProvider.GetAsync(id));
    })
    .WithDisplayName("Get a timeline by ID")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);

// category endpoints

app.MapGet("/categories/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var timeline = await timelineProvider.GetAsync(id);

        return timeline is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(await timelineProvider.GetCategoriesAsync(id));
    })
    .WithDisplayName("Get all categories for a timeline")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);

app.MapGet("/category/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var category = await timelineProvider.GetCategoryAsync(id);

        return category is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(category);
    })
    .WithDisplayName("Get a category by ID")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/category", async ([FromBody]InsertCategoryRequest request) =>
    {
        var newCategory = await timelineProvider.InsertCategoryAsync(request);

        return newCategory is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.CreatedAtRoute($"/categories/{newCategory.Value.CategoryId}");
    })
    .WithDisplayName("Create a new category")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status404NotFound);

app.MapPut("/category", async ([FromBody]UpdateCategoryRequest request) =>
    {
        var updateResult = await timelineProvider.UpdateCategoryAsync(request);

        return updateResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Update a category")
    .WithOpenApi()
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

// episode endpoints

app.MapGet("/episodes/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var episode = await timelineProvider.GetEpisodeAsync(id);

        return episode is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.Ok(episode);
    })
    .WithDisplayName("Get an episode by ID")
    .WithOpenApi()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);

app.MapPost("/episode", async ([FromBody]InsertEpisodeRequest request) =>
    {
        var newEpisode = await timelineProvider.InsertEpisodeAsync(request);

        return newEpisode is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.CreatedAtRoute($"/episodes/{newEpisode.Value.EpisodeId}");
    })
    .WithDisplayName("Create a new episode")
    .WithOpenApi()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status404NotFound);

app.MapPut("/episode", async ([FromBody]UpdateEpisodeRequest request) =>
    {
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

