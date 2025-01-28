using dotenv.net;
using Pictura.Vita.Data.Providers;
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

app.MapGet("/timelines", () => timelineProvider.GetAll());

app.Run();

