import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { PlannerDisplaySectionComponent } from './planner-display-section.component';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerMachinesSectionComponent } from './planner-machines-section.component';
import { PlannerObjectivesSectionComponent } from './planner-objectives-section.component';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerResourcesSectionComponent } from './planner-resources-section.component';
import { PlannerTargetsSectionComponent } from './planner-targets-section.component';
import {
  getPlannerWorkbenchPanel,
  PLANNER_WORKBENCH_PANELS,
} from './planner-workbench-panel-registry';

describe('PLANNER_WORKBENCH_PANELS', () => {
  it('defines the planner rail order, labels, and rendered components', () => {
    expect(
      PLANNER_WORKBENCH_PANELS.map((panel) => ({
        id: panel.id,
        label: panel.label,
        component: panel.component,
      })),
    ).toEqual([
      { id: 'plan', label: 'Plan', component: PlannerTargetsSectionComponent },
      { id: 'objectives', label: 'Objectives', component: PlannerObjectivesSectionComponent },
      { id: 'recipes', label: 'Recipes', component: PlannerRecipesSectionComponent },
      { id: 'inputs', label: 'Inputs', component: PlannerInputsSectionComponent },
      { id: 'resources', label: 'Resources', component: PlannerResourcesSectionComponent },
      { id: 'machines', label: 'Machines', component: PlannerMachinesSectionComponent },
      { id: 'display', label: 'Display', component: PlannerDisplaySectionComponent },
    ]);
  });

  it('keeps Recipes registered as the wide work panel', () => {
    expect(getPlannerWorkbenchPanel('recipes')).toMatchObject({
      id: 'recipes',
      width: 'wide',
      panelClass: 'work-panel--recipes',
    });
    expect(getPlannerWorkbenchPanel('plan')).toMatchObject({
      width: 'standard',
      panelClass: null,
    });
  });
});
