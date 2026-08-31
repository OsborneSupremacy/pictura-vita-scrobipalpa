using dotenv.net;
using Microsoft.AspNetCore.Http.Features;
using Pictura.Vita.Api.Images;
using Pictura.Vita.Api.Narratives;
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

// Make the type system mean what it says at the HTTP boundary. Without this, System.Text.Json
// happily writes a JSON null into a non-nullable `required string`, and the first thing to
// notice is a validator several layers down — or nothing at all, if no validator covers that
// property. With it, a request body carrying null for a non-nullable property is rejected as
// it is read.
//
// Scope worth knowing: this reaches only the API's own reading and writing of JSON. The data
// file is read and written by JsonFlatFileDataStore, which uses Newtonsoft.Json, and is not
// affected by any System.Text.Json setting — nulls already sitting in a file still load.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.RespectNullableAnnotations = true;
});

// Two separate limits sit in front of the upload endpoint, and BOTH have to be raised or the
// lower one answers first with a bare 413 and no explanation: Kestrel's request body size
// (30MB by default) and the multipart form length. Each is set above the application's own
// limit on purpose, so an over-large image reaches the check in the endpoint, which can say
// how big it was and what the limit is. Past this outer bound a 413 is the honest answer.
var uploadHardLimitBytes = ImageStore.MaxUploadBytes * 2;

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = uploadHardLimitBytes);
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = uploadHardLimitBytes;
});

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

// Images are optional, so unlike the data file a missing root is not fatal — but it is
// logged, because "no images anywhere" and "IMAGE_ROOT_PATH is mistyped" otherwise look
// exactly the same from the outside.
var imageStore = ImageStore.Create(dataFilePath);

// Narratives sit beside the images, derived from the same data file path, and are optional
// in exactly the same way.
var narrativeStore = NarrativeStore.Create(dataFilePath);

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

// image endpoints
//
// Images are served through the API rather than from a static file directory so the sandbox
// is enforced in one place. This is not paranoia about a local app: the API is an HTTP server
// on loopback that any page open in the browser can reach, and the file name it is asked for
// came out of a data file.

app.MapGet("/timeline/{id:guid}/images", ([FromRoute]Guid id) =>
        Results.Ok(imageStore.List(id)))
    .WithDisplayName("Get the image file names present for a timeline")
    .Produces<IEnumerable<string>>();

app.MapPost("/timeline/{id:guid}/image", async (
        [FromRoute]Guid id,
        HttpRequest request) =>
    {
        if (!request.HasFormContentType)
            return Results.BadRequest(new { error = "Send the image as multipart/form-data." });

        var form = await request.ReadFormAsync();
        var file = form.Files["file"];

        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No file was attached." });

        if (file.Length > ImageStore.MaxUploadBytes)
            return Results.BadRequest(new
            {
                error = $"That image is {file.Length / (1024 * 1024)} MB; the limit is "
                        + $"{ImageStore.MaxUploadBytes / (1024 * 1024)} MB."
            });

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer);

        // The episode title makes a far more useful file name than "IMG_4471", so the client
        // sends it. It only seeds the slug — the name is generated either way.
        var stem = form["stem"].ToString() is { Length: > 0 } supplied
            ? supplied
            : Path.GetFileNameWithoutExtension(file.FileName);

        var saved = imageStore.Save(id, buffer.ToArray(), stem, app.Logger);

        return saved.IsSuccess
            ? Results.Created($"/timeline/{id}/image/{saved.Value}", new { imageName = saved.Value })
            : Results.BadRequest(new { error = saved.Exception.Message });
    })
    .WithDisplayName("Upload an episode image")
    .DisableAntiforgery()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest);

app.MapGet("/timeline/{id:guid}/image/{name}", (
        [FromRoute]Guid id,
        [FromRoute]string name,
        [FromQuery]string? size) =>
    {
        var wantsThumbnail = string.Equals(size, "thumb", StringComparison.OrdinalIgnoreCase);

        var file = wantsThumbnail
            ? imageStore.Thumbnail(id, name, app.Logger)
            : imageStore.Find(id, name);

        // Every way this can fail — no root, an unsafe name, a name escaping the root, a
        // missing file, bytes that will not decode — answers the same 404, so probing says
        // nothing about what exists outside the sandbox.
        if (file is null) return Results.NotFound();

        // Passing lastModified is what makes this a conditional request: without it the
        // browser re-downloads every visible thumbnail on each re-render.
        return Results.File(
            file.FullName,
            contentType: ImageStore.ContentType(file.Name),
            lastModified: file.LastWriteTimeUtc,
            enableRangeProcessing: true);
    })
    .WithDisplayName("Get an episode image, full size or as a thumbnail")
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);

// narrative endpoints
//
// The long-form Markdown account of an episode. Stored as a file for the reasons in
// docs/narrative-support.md; served through the API for the same reason images are, so the
// containment check that turns a name from a data file into a path lives in one place.

app.MapGet("/timeline/{id:guid}/narratives", ([FromRoute]Guid id) =>
        Results.Ok(narrativeStore.List(id)))
    .WithDisplayName("Get the narrative file names present for a timeline")
    .Produces<IEnumerable<string>>();

app.MapGet("/timeline/{id:guid}/narrative/{name}", (
        [FromRoute]Guid id,
        [FromRoute]string name) =>
    {
        var text = narrativeStore.Read(id, name, app.Logger);

        // As with images, every failure answers the same 404 so probing says nothing about
        // what exists outside the sandbox.
        return text is null
            ? Results.NotFound()
            : Results.Text(text, "text/markdown", System.Text.Encoding.UTF8);
    })
    .WithDisplayName("Get an episode's narrative as Markdown")
    .Produces<string>()
    .Produces(StatusCodes.Status404NotFound);

app.MapPut("/timeline/{id:guid}/narrative", async (
        [FromRoute]Guid id,
        [FromBody]SaveNarrativeRequest request) =>
    {
        var saved = narrativeStore.Save(id, request.Name, request.Stem, request.Text ?? string.Empty, app.Logger);

        return saved.IsSuccess
            ? Results.Ok(new { narrativeName = saved.Value })
            : Results.BadRequest(new { error = saved.Exception.Message });
    })
    .WithDisplayName("Write an episode's narrative")
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status400BadRequest);

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

app.MapDelete("/episode/{id:guid}", async ([FromRoute]Guid id) =>
    {
        var deleteResult = await timelineProvider.DeleteEpisodeAsync(id);

        return deleteResult is { IsFaulted: true, Exception: KeyNotFoundException }
            ? Results.NotFound()
            : Results.NoContent();
    })
    .WithDisplayName("Delete an episode")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

app.Logger.LogInformation(
    "Image root: {Root}{Note}",
    imageStore.Root,
    imageStore.RootExists ? string.Empty : " (does not exist yet; the first upload creates it)");

app.Logger.LogInformation(
    "Narrative root: {Root}{Note}",
    narrativeStore.Root,
    narrativeStore.RootExists ? string.Empty : " (does not exist yet; the first save creates it)");

app.Run();

/// <summary>
/// Body of a narrative save.
///
/// <c>Name</c> is the file to write when the episode already points at one, and empty when it
/// does not — in which case <c>Stem</c> (the episode's title) seeds a generated name. Unlike
/// an image name it is accepted from the client, because a narrative is edited repeatedly and
/// its name must not move underneath the episode referring to it; <see cref="NarrativeStore"/>
/// puts it through the same containment check the read path uses.
/// </summary>
internal sealed record SaveNarrativeRequest
{
    public string? Name { get; init; }

    public string? Stem { get; init; }

    public string? Text { get; init; }
}

