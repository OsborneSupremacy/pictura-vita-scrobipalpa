import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

@Component({
    selector: 'app-timeline-info',
    templateUrl: './timeline-info.component.html',
    styleUrls: ['./timeline-info.component.scss']
})
export class TimelineInfoComponent implements OnInit {

    public form: FormGroup;


    constructor(private formBuilder: FormBuilder) {

        this.form = this.formBuilder.group({
            name: ['', Validators.required]
        });
    }

    ngOnInit(): void {
    }

}
