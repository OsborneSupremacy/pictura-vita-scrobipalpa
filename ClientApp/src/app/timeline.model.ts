import { Category } from "./category.model";
import { Episode } from "./episode.model";
import { SubjectType } from "./subject-type";

export interface Timeline {
    TimelineId: string,
    Title: string,
    Subtitle: string,
    Start: Date,
    End: Date,
    Episodes: Episode[],
    Categories: Category[],
    SubjectType: SubjectType
}
