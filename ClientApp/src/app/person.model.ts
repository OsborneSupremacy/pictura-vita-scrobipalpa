import { DatePrecision } from "./date-precision";

export interface Person {
    NameParts: string[],
    TitleParts: string[],
    BirthPrecision: DatePrecision,
    Birth: Date,
    DeathPrecision: DatePrecision,
    Death: Date
}
