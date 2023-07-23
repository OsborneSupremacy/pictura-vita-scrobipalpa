import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

@Component({
    selector: 'app-timeline-add-done',
    templateUrl: './timeline-add-done.component.html',
    styleUrls: ['./timeline-add-done.component.scss']
})
export class TimelineAddDoneComponent implements OnInit {

    public form: FormGroup;


    constructor(private formBuilder: FormBuilder) {

        this.form = this.formBuilder.group({
            name: ['', Validators.required]
        });
    }

    ngOnInit(): void {
    }

}
