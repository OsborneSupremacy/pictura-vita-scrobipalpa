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

    constructor(private router: Router
    ) { }

    ngOnInit(): void {
    }

}
