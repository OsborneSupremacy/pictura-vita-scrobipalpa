import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

@Component({
    selector: 'app-person',
    templateUrl: './person.component.html',
    styleUrls: ['./person.component.scss']
})
export class PersonComponent implements OnInit {

    public form: FormGroup;


    constructor(private formBuilder: FormBuilder) {

        this.form = this.formBuilder.group({
            name: ['', Validators.required]
        });
    }

    ngOnInit(): void {
    }

}
