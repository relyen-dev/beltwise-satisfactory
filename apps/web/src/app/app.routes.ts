import { Routes } from '@angular/router';
import { AboutPageComponent } from '../features/about/about-page.component';
import { PlannerPageComponent } from '../features/planner/planner-page.component';

export const routes: Routes = [
  {
    path: 'about',
    component: AboutPageComponent,
  },
  {
    path: '',
    pathMatch: 'full',
    component: PlannerPageComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
