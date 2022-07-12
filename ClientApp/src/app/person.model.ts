import { DatePrecision } from "./date-precision";

export interface Person {
    NameParts: string[],
    TitleParts: string[],
    BirthPrecision: DatePrecision,
    Birth: Date | null,
    DeathPrecision: DatePrecision,
    Death: Date | null
}
