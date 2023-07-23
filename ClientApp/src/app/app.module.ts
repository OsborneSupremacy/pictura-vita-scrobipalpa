import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatStepperModule } from '@angular/material/stepper';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule  } from '@angular/material/core';

import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { TimelineAddComponent } from './timeline-add/timeline-add.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MainMenuComponent } from './main-menu/main-menu.component';
import { HomeComponent } from './home/home.component';
import { TimelineAddPersonComponent } from './timeline-add-person/timeline-add-person.component';
import { TimelineAddOrganizationComponent } from './timeline-add-organization/timeline-add-organization.component';
import { TimelineViewComponent } from './timeline-view/timeline-view.component';
import { TimelineAddPersonOverviewComponent } from './timeline-add-person-overview/timeline-add-person-overview.component';
import { PersonComponent } from './person/person.component';
import { TimelineInfoComponent } from './timeline-info/timeline-info.component';
import { OrganizationComponent } from './organization/organization.component';
import { TimelineAddDoneComponent } from './timeline-add-done/timeline-add-done.component';

@NgModule({
  declarations: [
    AppComponent,
    TimelineAddComponent,
    MainMenuComponent,
    HomeComponent,
    TimelineAddPersonComponent,
    TimelineAddOrganizationComponent,
    TimelineViewComponent,
    TimelineAddPersonOverviewComponent,
    PersonComponent,
    TimelineInfoComponent,
    OrganizationComponent,
    TimelineAddDoneComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    MatListModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatCardModule,
    MatStepperModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
