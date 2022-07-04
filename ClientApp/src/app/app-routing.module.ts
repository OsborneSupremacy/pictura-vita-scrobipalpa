import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TimelineAddComponent } from './timeline-add/timeline-add.component';

const routes: Routes = [
    {
        path: 'timeline/add',
        component: TimelineAddComponent
    }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
