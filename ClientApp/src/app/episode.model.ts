import { Privacy } from "./privacy";
import { EpisodeType } from "./episode-type";
import { DatePrecision } from "./date-precision";

export interface Episode {
    EpisodeId: string;
    Privacy: Privacy;
    Title: string;
    Subtitle: string;
    Description: string;
    Url: string;
    UrlDescription: string;
    EpisodeType: EpisodeType,
    StartPrecision: DatePrecision,
    Start: Date,
    EndPrecision: DatePrecision,
    End: Date | null
}
