import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Timeline } from '../timeline.model'
import { Person } from '../person.model';

@Component({
  selector: 'app-timeline-add-person',
  templateUrl: './timeline-add-person.component.html',
  styleUrls: ['./timeline-add-person.component.scss']
})
export class TimelineAddPersonComponent implements OnInit {

    public subjectFormGroup: FormGroup;
    public personFormGroup: FormGroup;
    public timelineFormGroup: FormGroup;

    constructor(private router: Router, private formBuilder: FormBuilder) {

        let person = <Person>{
            Name: ''
        }

        let timeline = <Timeline>{
            Title: '',
            Subtitle: '',
            SubjectType: null,
            Start: null,
            End: null,
            Person: person
        };

        this.subjectFormGroup = this.formBuilder.group({
            SubjectType: [timeline.SubjectType, Validators.required]
        });

        this.personFormGroup = this.formBuilder.group({
            Name: [timeline.Person?.Name, Validators.required],
            Birth: [timeline.Person?.Birth],
            Death: [timeline.Person?.Death]
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
