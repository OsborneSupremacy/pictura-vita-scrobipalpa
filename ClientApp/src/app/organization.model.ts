import { DatePrecision } from "./date-precision";

export interface Organization {
    Name: string,
    ApproximateStart: boolean,
    StartPrecision: DatePrecision,
    Start: Date,
    EndPrecision: DatePrecision,
    End: Date
}
