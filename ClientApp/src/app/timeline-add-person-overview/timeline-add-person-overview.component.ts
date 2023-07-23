import { ViewChild, Component, OnInit } from '@angular/core';

import { PersonComponent } from '../person/person.component';
import { TimelineInfoComponent } from '../timeline-info/timeline-info.component';
import { TimelineAddDoneComponent } from '../timeline-add-done/timeline-add-done.component';

@Component({
    selector: 'app-timeline-add-person-overview',
    templateUrl: './timeline-add-person-overview.component.html',
    styleUrls: ['./timeline-add-person-overview.component.scss']
})
export class TimelineAddPersonOverviewComponent implements OnInit {

    @ViewChild(PersonComponent) step1Component: PersonComponent | undefined;
    @ViewChild(TimelineInfoComponent) step2Component: TimelineInfoComponent | undefined;
    @ViewChild(TimelineAddDoneComponent) step3Component: TimelineAddDoneComponent | undefined;

    constructor() { }

    ngOnInit(): void {
    }

    get step1() {
        return this.step1Component ? this.step1Component.form : null;
    }

    get step2() {
        return this.step2Component ? this.step2Component.form : null;
    }

    get step3() {
        return this.step3Component ? this.step3Component.form : null;
    }

}
