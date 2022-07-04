import { Privacy } from "./privacy";

export interface Category {
    CategoryId: string,
    Title: string,
    Subtitle: string,
    Privacy: Privacy,
    EpisodeIds: string[]
}
