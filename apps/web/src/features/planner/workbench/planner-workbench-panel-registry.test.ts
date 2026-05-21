import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerTargetsSectionComponent } from './planner-targets-section.component';
import {
  getPlannerWorkbenchPanel,
  PLANNER_WORKBENCH_PANELS,
} from './planner-workbench-panel-registry';

describe('PLANNER_WORKBENCH_PANELS', () => {
  it('defines the planner rail order, labels, and lazy loaders', () => {
    expect(
      PLANNER_WORKBENCH_PANELS.map((panel) => ({
        id: panel.id,
        label: panel.label,
        width: panel.width,
        panelClass: panel.panelClass,
        hasLazyLoader: typeof panel.loadComponent === 'function',
      })),
    ).toEqual([
      {
        id: 'plan',
        label: 'Plan',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'objectives',
        label: 'Objectives',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'recipes',
        label: 'Recipes',
        width: 'wide',
        panelClass: 'work-panel--recipes',
        hasLazyLoader: true,
      },
      {
        id: 'inputs',
        label: 'Inputs',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'resources',
        label: 'Resources',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'machines',
        label: 'Machines',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'display',
        label: 'Display',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
    ]);
  });

  it('resolves known panel metadata by id without eager component references', () => {
    expect(getPlannerWorkbenchPanel('recipes')).toMatchObject({
      id: 'recipes',
      label: 'Recipes',
      width: 'wide',
      panelClass: 'work-panel--recipes',
    });
    expect(getPlannerWorkbenchPanel('plan')).toMatchObject({
      id: 'plan',
      label: 'Plan',
      width: 'standard',
      panelClass: null,
    });
  });

  it('loads registered panel components on demand', async () => {
    await expect(getPlannerWorkbenchPanel('plan').loadComponent()).resolves.toBe(
      PlannerTargetsSectionComponent,
    );
    await expect(getPlannerWorkbenchPanel('recipes').loadComponent()).resolves.toBe(
      PlannerRecipesSectionComponent,
    );
  });
});
