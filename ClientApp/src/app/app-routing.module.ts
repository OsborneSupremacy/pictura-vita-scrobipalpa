import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { TimelineAddComponent } from './timeline-add/timeline-add.component';

const routes: Routes = [
    {
        path: '',
        component: HomeComponent
    },
    {
        path: 'timeline/add',
        component: TimelineAddComponent,
    }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
