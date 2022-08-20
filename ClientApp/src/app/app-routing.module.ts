import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { TimelineAddOrganizationComponent } from './timeline-add-organization/timeline-add-organization.component';
import { TimelineAddPersonComponent } from './timeline-add-person/timeline-add-person.component';
import { TimelineAddComponent } from './timeline-add/timeline-add.component';

const routes: Routes = [
    {
        path: '',
        component: HomeComponent
    },
    {
        path: 'timeline/add',
        component: TimelineAddComponent,
    },
    {
        path: 'timeline/add/person',
        component: TimelineAddPersonComponent,
    },
    {
        path: 'timeline/add/organization',
        component: TimelineAddOrganizationComponent,
    },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
