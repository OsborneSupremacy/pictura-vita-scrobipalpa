import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Timeline } from '../timeline.model'
import { Person } from '../person.model';
import { Organization } from '../organization.model';

@Component({
    selector: 'app-timeline-add',
    templateUrl: './timeline-add.component.html',
    styleUrls: ['./timeline-add.component.scss']
})
export class TimelineAddComponent implements OnInit {

    public subjectFormGroup: FormGroup;
    public personFormGroup: FormGroup;
    public organizationFormGroup: FormGroup;
    public timelineFormGroup: FormGroup;

    constructor(private router: Router, private formBuilder: FormBuilder) {

        let person = <Person>{
            Name: ''
        }

        let organization = <Organization>{
            Name: ''
        }

        let timeline = <Timeline>{
            Title: '',
            Subtitle: '',
            SubjectType: null,
            Start: null,
            End: null,
            Person: person,
            Organizaton: organization
        };

        this.subjectFormGroup = this.formBuilder.group({
            SubjectType: [timeline.SubjectType, Validators.required]
        });

        this.personFormGroup = this.formBuilder.group({
            Name: [timeline.Person?.Name, Validators.required],
            Birth: [timeline.Person?.Birth],
            Death: [timeline.Person?.Death]
        });

        this.organizationFormGroup = this.formBuilder.group({
            Name: [timeline.Organizaton?.Name, Validators.required],
            Start: [timeline.Organizaton?.Start],
            End: [timeline.Organizaton?.End],
        });

        this.timelineFormGroup = this.formBuilder.group({
            Title: [timeline.Title, Validators.required],
            Subtitle: [timeline.Subtitle],
            Start: null,
            End: null
        });
    }

    ngOnInit(): void {
    }

}
