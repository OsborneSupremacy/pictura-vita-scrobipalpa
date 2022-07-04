import { Organization } from "./organization.model";
import { Person } from "./person.model";
import { SubjectType } from "./subject-type";

export interface TimelineSubject {
    SubjectType: SubjectType,
    Organizaton: Organization,
    Person: Person,
    Image: string // base64-encoded image
}
