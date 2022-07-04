import { Timeline } from "./timeline.model";

export interface TimelineView {
    Timeline: Timeline,
    Start: Date,
    End: Date,
    ShowEmptyCategories: boolean
}
