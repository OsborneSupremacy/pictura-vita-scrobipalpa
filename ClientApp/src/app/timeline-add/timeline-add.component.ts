import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

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
