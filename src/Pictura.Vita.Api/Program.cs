using dotenv.net;
using Microsoft.AspNetCore.Http.Features;
using Pictura.Vita.Api.Images;
using Pictura.Vita.Api.Narratives;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Pictura.Vita.Api.Validators;
using Scalar.AspNetCore;

// Do not clobber variables already set in the environment: an explicit value from the
// shell must win over .env, or you cannot safely point this at a scratch directory.
DotEnv.Load(new DotEnvOptions(overwriteExistingVars: false));

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
// includeInternalTypes: the validators are internal, and the scanner skips internal types
// by default. Without this every endpoint that resolves a validator fails at request time
// with "No service for type ... has been registered".
builder.Services.AddValidatorsFromAssemblyContaining<CategoryValidator>(includeInternalTypes: true);

// The timeline span validator needs to know what "today" is, because an ongoing timeline
// stores the 9999-12-31 sentinel and is drawn to the current date instead. Resolved through
// TimeProvider rather than read off DateTime.Today so the rule is not welded to the system
// clock, and evaluated per request rather than captured, since a validator is registered once
// and would otherwise freeze "today" at start-up. TryAdd because the host may register it.
builder.Services.TryAddSingleton(TimeProvider.System);

// Make the type system mean what it says at the HTTP boundary. Without this, System.Text.Json
// happily writes a JSON null into a non-nullable `required string`, and the first thing to
// notice is a validator several layers down — or nothing at all, if no validator covers that
// property. With it, a request body carrying null for a non-nullable property is rejected as
// it is read.
//
// The data file now gets the same treatment. It used to be read and written by
// JsonFlatFileDataStore over Newtonsoft.Json, which no System.Text.Json setting could reach,
// so a null already sitting in a file loaded silently. TimelineFileStore sets the same option
// on its own serializer.
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

var timelinesRoot = Environment.GetEnvironmentVariable("TIMELINES_ROOT_PATH");

// Fail loudly at startup rather than serving an empty table of contents: a root that is
// missing or misconfigured otherwise looks identical to having no timelines yet.
if (string.IsNullOrWhiteSpace(timelinesRoot))
    throw new InvalidOperationException(
        "TIMELINES_ROOT_PATH is not set. Copy .env.example to .env in the API project and "
        + "point TIMELINES_ROOT_PATH at the directory holding your timelines.");

if (!Directory.Exists(timelinesRoot))
    throw new InvalidOperationException(
        $"TIMELINES_ROOT_PATH points at \"{timelinesRoot}\", which does not exist. Check the "
        + "path in the API project's .env file, or create the directory — an empty one is a "
        + "perfectly good starting point.");

// A timeline is one directory named for its id, holding data.v1.json, images/ and narratives/.
// All three stores are handed the same root and derive their paths from the timeline id, which
// is what keeps a timeline one portable folder rather than three configurable ones.
var timelineStore = new TimelineFileStore(timelinesRoot, app.Logger);
var timelineProvider = new TimelineProvider(timelineStore);
var randomTimelineProvider = new RandomTimelineProvider();
var imageStore = ImageStore.Create(timelinesRoot);
var narrativeStore = NarrativeStore.Create(timelinesRoot);

// Every endpoint hangs off a version group, so the "/v1" segment is written once instead of
// being repeated on forty routes — and a future v2 is a second group beside this one rather
// than a prefix edited into every line. Nothing is served off an unversioned path: a caller
// that omits the segment gets a 404, which is a better answer than silently getting whatever
// the current shape happens to be.
var v1 = app.MapGroup("/v1");

// timeline endpoints

// The CancellationToken is bound by the framework to HttpContext.RequestAborted, so a browser
// that navigates away mid-listing stops the server reading the rest of the timeline files.
v1.MapGet("/timelines", async (CancellationToken cancellationToken) =>
        Results.Ok(await timelineProvider.GetAllSummariesAsync(cancellationToken)))
    .WithDisplayName("List every timeline")
    .Produces<IReadOnlyList<TimelineSummary>>();

v1.MapGet("/timelines/random", () => Results.Ok(randomTimelineProvider.Generate()))
    .WithDisplayName("Get a random timeline")
    .Produces<Timeline>();

v1.MapPost("/timelines", async (
        [FromServices] CreateTimelineRequestValidator validator,
        [FromBody] CreateTimelineRequest request,
        CancellationToken cancellationToken) =>
    {
        var validation = await validator.ValidateAsync(request, cancellationToken);

        if (!validation.IsValid) return Results.ValidationProblem(validation.ToDictionary());

        var created = await timelineProvider.CreateAsync(request);

        return created.IsSuccess
            ? Results.Created($"/v1/timelines/{created.Value.TimelineId}", created.Value)
            : Faulted(created.Exception);
    })
    .WithDisplayName("Create a new timeline")
    .Produces<Timeline>(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest);

v1.MapGet("/timelines/{timelineId:guid}", async (
        [FromRoute] Guid timelineId,
        CancellationToken cancellationToken) =>
        Ok(await timelineProvider.GetAsync(timelineId, cancellationToken)))
    .WithDisplayName("Get a timeline by ID")
    .Produces<Timeline>()
    .Produces(StatusCodes.Status404NotFound);

// Takes only the information being changed. It previously accepted a whole Timeline, which
// meant sending every episode back to the server to rename the subject.
v1.MapPut("/timelines/{timelineId:guid}/info", async (
        [FromRoute] Guid timelineId,
        [FromServices] UpdateTimelineInfoRequestValidator validator,
        [FromBody] UpdateTimelineInfoRequest request,
        CancellationToken cancellationToken) =>
    {
        if (Mismatched(timelineId, request.TimelineId) is { } mismatch) return mismatch;

        var validation = await validator.ValidateAsync(request, cancellationToken);

        return validation.IsValid
            ? NoContent(await timelineProvider.UpdateTimelineInfoAsync(request, cancellationToken))
            : Results.ValidationProblem(validation.ToDictionary());
    })
    .WithDisplayName("Update a timeline's information")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

// category endpoints

v1.MapGet("/timelines/{timelineId:guid}/categories", async (
        [FromRoute] Guid timelineId,
        CancellationToken cancellationToken) =>
        Ok(await timelineProvider.GetCategoriesAsync(timelineId, cancellationToken)))
    .WithDisplayName("Get all categories for a timeline")
    .Produces<IReadOnlyList<Category>>()
    .Produces(StatusCodes.Status404NotFound);

v1.MapGet("/timelines/{timelineId:guid}/categories/{categoryId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid categoryId,
        CancellationToken cancellationToken) =>
        Ok(await timelineProvider.GetCategoryAsync(timelineId, categoryId, cancellationToken)))
    .WithDisplayName("Get a category by ID")
    .Produces<Category>()
    .Produces(StatusCodes.Status404NotFound);

v1.MapPost("/timelines/{timelineId:guid}/categories", async (
        [FromRoute] Guid timelineId,
        [FromServices] InsertCategoryRequestValidator validator,
        [FromBody] InsertCategoryRequest request,
        CancellationToken cancellationToken) =>
    {
        if (Mismatched(timelineId, request.TimelineId) is { } mismatch) return mismatch;

        var validation = await validator.ValidateAsync(request, cancellationToken);

        if (!validation.IsValid) return Results.ValidationProblem(validation.ToDictionary());

        var created = await timelineProvider.InsertCategoryAsync(request, cancellationToken);

        return created.IsSuccess
            ? Results.Created(
                $"/v1/timelines/{timelineId}/categories/{created.Value.CategoryId}", created.Value)
            : Faulted(created.Exception);
    })
    .WithDisplayName("Create a new category")
    .Produces<Category>(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

v1.MapPut("/timelines/{timelineId:guid}/categories/{categoryId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid categoryId,
        [FromServices] UpdateCategoryRequestValidator validator,
        [FromBody] UpdateCategoryRequest request,
        CancellationToken cancellationToken) =>
    {
        if (Mismatched(timelineId, request.TimelineId) is { } mismatch) return mismatch;
        if (Mismatched(categoryId, request.Category.CategoryId) is { } wrongCategory)
            return wrongCategory;

        var validation = await validator.ValidateAsync(request, cancellationToken);

        return validation.IsValid
            ? NoContent(await timelineProvider.UpdateCategoryAsync(request, cancellationToken))
            : Results.ValidationProblem(validation.ToDictionary());
    })
    .WithDisplayName("Update a category")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

v1.MapDelete("/timelines/{timelineId:guid}/categories/{categoryId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid categoryId,
        CancellationToken cancellationToken) =>
        NoContent(await timelineProvider.DeleteCategoryAsync(
            timelineId, categoryId, cancellationToken)))
    .WithDisplayName("Delete a category")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

// episode endpoints

v1.MapGet("/timelines/{timelineId:guid}/episodes/{episodeId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid episodeId,
        CancellationToken cancellationToken) =>
        Ok(await timelineProvider.GetEpisodeAsync(timelineId, episodeId, cancellationToken)))
    .WithDisplayName("Get an episode by ID")
    .Produces<Episode>()
    .Produces(StatusCodes.Status404NotFound);

v1.MapPost("/timelines/{timelineId:guid}/episodes", async (
        [FromRoute] Guid timelineId,
        [FromServices] InsertEpisodeRequestValidator validator,
        [FromBody] InsertEpisodeRequest request,
        CancellationToken cancellationToken) =>
    {
        if (Mismatched(timelineId, request.TimelineId) is { } mismatch) return mismatch;

        var validation = await validator.ValidateAsync(request, cancellationToken);

        if (!validation.IsValid) return Results.ValidationProblem(validation.ToDictionary());

        var created = await timelineProvider.InsertEpisodeAsync(request, cancellationToken);

        return created.IsSuccess
            ? Results.Created(
                $"/v1/timelines/{timelineId}/episodes/{created.Value.EpisodeId}", created.Value)
            : Faulted(created.Exception);
    })
    .WithDisplayName("Create a new episode")
    .Produces<Episode>(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

v1.MapPut("/timelines/{timelineId:guid}/episodes/{episodeId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid episodeId,
        [FromServices] UpdateEpisodeRequestValidator validator,
        [FromBody] UpdateEpisodeRequest request,
        CancellationToken cancellationToken) =>
    {
        if (Mismatched(timelineId, request.TimelineId) is { } mismatch) return mismatch;
        if (Mismatched(episodeId, request.Episode.EpisodeId) is { } wrongEpisode)
            return wrongEpisode;

        var validation = await validator.ValidateAsync(request, cancellationToken);

        return validation.IsValid
            ? NoContent(await timelineProvider.UpdateEpisodeAsync(request, cancellationToken))
            : Results.ValidationProblem(validation.ToDictionary());
    })
    .WithDisplayName("Update an episode")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound);

v1.MapDelete("/timelines/{timelineId:guid}/episodes/{episodeId:guid}", async (
        [FromRoute] Guid timelineId,
        [FromRoute] Guid episodeId,
        CancellationToken cancellationToken) =>
        NoContent(await timelineProvider.DeleteEpisodeAsync(
            timelineId, episodeId, cancellationToken)))
    .WithDisplayName("Delete an episode")
    .Produces(StatusCodes.Status204NoContent)
    .Produces(StatusCodes.Status404NotFound);

// image endpoints
//
// Images are served through the API rather than from a static file directory so the sandbox
// is enforced in one place. This is not paranoia about a local app: the API is an HTTP server
// on loopback that any page open in the browser can reach, and the file name it is asked for
// came out of a data file.

v1.MapGet("/timelines/{timelineId:guid}/images", ([FromRoute] Guid timelineId) =>
        Results.Ok(imageStore.List(timelineId)))
    .WithDisplayName("Get the image file names present for a timeline")
    .Produces<IEnumerable<string>>();

v1.MapPost("/timelines/{timelineId:guid}/images", async (
        [FromRoute] Guid timelineId,
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

        var saved = imageStore.Save(timelineId, buffer.ToArray(), stem, app.Logger);

        return saved.IsSuccess
            ? Results.Created(
                $"/v1/timelines/{timelineId}/images/{saved.Value}", new { imageName = saved.Value })
            : Results.BadRequest(new { error = saved.Exception.Message });
    })
    .WithDisplayName("Upload an episode image")
    .DisableAntiforgery()
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest);

v1.MapGet("/timelines/{timelineId:guid}/images/{name}", (
        [FromRoute] Guid timelineId,
        [FromRoute] string name,
        [FromQuery] string? size) =>
    {
        var wantsThumbnail = string.Equals(size, "thumb", StringComparison.OrdinalIgnoreCase);

        var file = wantsThumbnail
            ? imageStore.Thumbnail(timelineId, name, app.Logger)
            : imageStore.Find(timelineId, name);

        // Every way this can fail — no directory, an unsafe name, a name escaping the
        // timeline's own folder, a missing file, bytes that will not decode — answers the same
        // 404, so probing says nothing about what exists outside the sandbox.
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

v1.MapGet("/timelines/{timelineId:guid}/narratives", ([FromRoute] Guid timelineId) =>
        Results.Ok(narrativeStore.List(timelineId)))
    .WithDisplayName("Get the narrative file names present for a timeline")
    .Produces<IEnumerable<string>>();

v1.MapGet("/timelines/{timelineId:guid}/narratives/{name}", (
        [FromRoute] Guid timelineId,
        [FromRoute] string name) =>
    {
        var text = narrativeStore.Read(timelineId, name, app.Logger);

        // As with images, every failure answers the same 404 so probing says nothing about
        // what exists outside the sandbox.
        return text is null
            ? Results.NotFound()
            : Results.Text(text, "text/markdown", System.Text.Encoding.UTF8);
    })
    .WithDisplayName("Get an episode's narrative as Markdown")
    .Produces<string>()
    .Produces(StatusCodes.Status404NotFound);

// The name stays in the body rather than the path, because on a first save there is no name
// yet — the server generates one from the episode's title — and a PUT to a URL that cannot be
// written down is worse than a body that explains itself.
v1.MapPut("/timelines/{timelineId:guid}/narratives", (
        [FromRoute] Guid timelineId,
        [FromBody] SaveNarrativeRequest request) =>
    {
        var saved = narrativeStore.Save(
            timelineId, request.Name, request.Stem, request.Text ?? string.Empty, app.Logger);

        return saved.IsSuccess
            ? Results.Ok(new { narrativeName = saved.Value })
            : Results.BadRequest(new { error = saved.Exception.Message });
    })
    .WithDisplayName("Write an episode's narrative")
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status400BadRequest);

app.Logger.LogInformation(
    "Timelines root: {Root} ({Count} timeline(s))", timelineStore.Root, timelineStore.Ids().Count);

app.Run();

// Every provider call comes back as a Result carrying either the value or the exception that
// explains why there is not one. Mapping those to status codes in one place is what keeps a
// data file that is present but wrong from surfacing as a bare 500 with an empty body — a
// caller told "not found" would reasonably go on to overwrite it.
static IResult Faulted(Exception exception) => exception switch
{
    KeyNotFoundException => Results.NotFound(),
    InvalidDataException => Results.Problem(
        exception.Message,
        title: "That timeline's file on disk is not valid",
        statusCode: StatusCodes.Status500InternalServerError),
    _ => Results.Problem(
        exception.Message, statusCode: StatusCodes.Status500InternalServerError)
};

static IResult Ok<T>(Pictura.Vita.Utility.Result<T> result) =>
    result.IsSuccess ? Results.Ok(result.Value) : Faulted(result.Exception);

static IResult NoContent(Pictura.Vita.Utility.Result result) =>
    result.IsSuccess ? Results.NoContent() : Faulted(result.Exception);

// Guards a request body that repeats an id already in the route. Now that each timeline is
// its own directory, a body naming a different timeline than the URL would write to a file the
// caller did not ask for. Answering 400 makes that a mistake rather than a silent one.
static IResult? Mismatched(Guid fromRoute, Guid fromBody) =>
    fromRoute == fromBody
        ? null
        : Results.BadRequest(new
        {
            error = $"The URL names {fromRoute} but the body names {fromBody}."
        });

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
