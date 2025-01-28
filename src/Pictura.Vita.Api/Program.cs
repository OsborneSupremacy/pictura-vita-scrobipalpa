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

app.MapGet("/timelines", () => timelineProvider.GetAllAsync());

app.MapGet("/timeline/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetAsync(id));

// category endpoints

app.MapGet("/categories/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetCategoriesAsync(id));

app.MapGet("/category/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetCategoryAsync(id));

app.MapPost("/category", async ([FromBody]InsertCategoryRequest request) =>
{
    var newCategory = await timelineProvider.InsertCategoryAsync(request);
    return Results.CreatedAtRoute($"/categories/{newCategory.CategoryId}");
});

// episode endpoints

app.MapGet("/episodes/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetEpisodeAsync(id));

app.MapPost("/episode", async ([FromBody]InsertEpisodeRequest request) =>
{
    var newEpisode = await timelineProvider.InsertEpisodeAsync(request);
    return Results.CreatedAtRoute($"/episodes/{newEpisode.EpisodeId}");
});

app.Run();

