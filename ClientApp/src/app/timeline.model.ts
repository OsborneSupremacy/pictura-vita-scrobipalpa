import { Category } from "./category.model";
import { Episode } from "./episode.model";
import { SubjectType } from "./subject-type";

export interface Timeline {
    TimelineId: string,
    Title: string,
    Subtitle: string,
    Start: Date | null,
    End: Date | null,
    Episodes: Episode[],
    Categories: Category[],
    SubjectType: SubjectType | null
}
