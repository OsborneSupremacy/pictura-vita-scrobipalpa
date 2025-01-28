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

app.MapGet("/timelines", () => timelineProvider.GetAllAsync());

app.MapGet("/timeline/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetAsync(id));

app.MapGet("/categories/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetCategoriesAsync(id));

app.MapGet("/category/{id:guid}", ([FromRoute]Guid id) => timelineProvider.GetCategoryAsync(id));

app.MapPost("/category", async ([FromBody]InsertCategoryRequest request) =>
{
    await timelineProvider.InsertCategoryAsync(request);
    return Results.CreatedAtRoute($"/categories/{request.Category.CategoryId}");
});

app.Run();

