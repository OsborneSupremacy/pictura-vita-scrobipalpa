import { DatePrecision } from "./date-precision";

export interface Person {
    Name: string,
    Email: string,
    BirthPrecision: DatePrecision,
    Birth: Date | null,
    DeathPrecision: DatePrecision,
    Death: Date | null
}
