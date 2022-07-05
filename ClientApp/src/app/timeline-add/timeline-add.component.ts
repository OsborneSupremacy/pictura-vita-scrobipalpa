import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Timeline } from '../timeline.model'

@Component({
    selector: 'app-timeline-add',
    templateUrl: './timeline-add.component.html',
    styleUrls: ['./timeline-add.component.scss']
})
export class TimelineAddComponent implements OnInit {

    firstFormGroup = this.formBuilder.group({
        firstCtrl: ['', Validators.required],
    });
    secondFormGroup = this.formBuilder.group({
        secondCtrl: ['', Validators.required],
    });

    constructor(private router: Router, private formBuilder: FormBuilder
    ) { }

    ngOnInit(): void {
    }

}
