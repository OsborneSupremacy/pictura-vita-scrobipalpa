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

    public firstFormGroup: FormGroup;
    public secondFormGroup: FormGroup;

    /*
    firstFormGroup = this.formBuilder.group({
        firstCtrl: ['', Validators.required],
    });

    secondFormGroup = this.formBuilder.group({
        secondCtrl: ['', Validators.required],
    });
    */

    constructor(private router: Router, private formBuilder: FormBuilder
    ) {
        let timeline = <Timeline>{
            Title: '',
            Subtitle: '',
            SubjectType: null,
            Start: null,
            End: null
        };

        this.firstFormGroup = this.formBuilder.group({
            SubjectType: [timeline.SubjectType, Validators.required]
        });

        this.secondFormGroup = this.formBuilder.group({
            Title: [timeline.Title, Validators.required],
            Subtitle: [timeline.Subtitle],
            Start: null,
            End: null
        });
    }

    ngOnInit(): void {
    }

}
