import { DatePrecision } from "./date-precision";

export interface Organization {
    Name: string,
    ApproximateStart: boolean,
    StartPrecision: DatePrecision,
    Start: Date | null,
    EndPrecision: DatePrecision,
    End: Date | null
}
