﻿namespace Pictura.Vita.Messaging;

public record InsertCategoryRequest
{
    public required Guid TimelineId { get; init; }

    public required Category Category { get; init; }
}