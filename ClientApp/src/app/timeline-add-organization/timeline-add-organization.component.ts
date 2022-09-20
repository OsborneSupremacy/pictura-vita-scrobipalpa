import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Timeline } from '../timeline.model'
import { Organization } from '../organization.model';

@Component({
    selector: 'app-timeline-add-organization',
    templateUrl: './timeline-add-organization.component.html',
    styleUrls: ['./timeline-add-organization.component.scss']
})
export class TimelineAddOrganizationComponent implements OnInit {

    public subjectFormGroup: FormGroup;
    public organizationFormGroup: FormGroup;
    public timelineFormGroup: FormGroup;

    constructor(private router: Router, private formBuilder: FormBuilder) {

        let organization = <Organization>{
            Name: ''
        }

        let timeline = <Timeline>{
            Title: '',
            Subtitle: '',
            SubjectType: null,
            Start: null,
            End: null,
            Organizaton: organization
        };

        this.subjectFormGroup = this.formBuilder.group({
            SubjectType: [timeline.SubjectType, Validators.required]
        });

        this.organizationFormGroup = this.formBuilder.group({
            Name: [timeline.Organizaton?.Name, Validators.required],
            Start: [timeline.Organizaton?.Start],
            End: [timeline.Organizaton?.End],
        });

        this.timelineFormGroup = this.formBuilder.group({
            Title: [timeline.Title],
            Subtitle: [timeline.Subtitle],
            Start: null,
            End: null
        });
    }

    ngOnInit(): void {
    }

}
