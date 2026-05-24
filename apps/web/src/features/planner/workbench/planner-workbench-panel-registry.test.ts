import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerSinksSectionComponent } from './planner-sinks-section.component';
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
        navHint: panel.navHint,
        navGroup: panel.navGroup,
        width: panel.width,
        panelClass: panel.panelClass,
        hasLazyLoader: typeof panel.loadComponent === 'function',
      })),
    ).toEqual([
      {
        id: 'plan',
        label: 'Plan',
        navHint: 'Targets',
        navGroup: 'primary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'recipes',
        label: 'Recipes',
        navHint: 'Rules',
        navGroup: 'primary',
        width: 'wide',
        panelClass: 'work-panel--recipes',
        hasLazyLoader: true,
      },
      {
        id: 'inputs',
        label: 'Inputs',
        navHint: 'Supply',
        navGroup: 'primary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'sinks',
        label: 'Sinks',
        navHint: 'Surplus',
        navGroup: 'primary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'machines',
        label: 'Machines',
        navHint: 'Build',
        navGroup: 'primary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'resources',
        label: 'Resources',
        navHint: 'Caps',
        navGroup: 'primary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'objectives',
        label: 'Objectives',
        navHint: 'Limits',
        navGroup: 'secondary',
        width: 'standard',
        panelClass: null,
        hasLazyLoader: true,
      },
      {
        id: 'display',
        label: 'Display',
        navHint: 'View',
        navGroup: 'secondary',
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
      navHint: 'Rules',
      navGroup: 'primary',
      width: 'wide',
      panelClass: 'work-panel--recipes',
    });
    expect(getPlannerWorkbenchPanel('plan')).toMatchObject({
      id: 'plan',
      label: 'Plan',
      navHint: 'Targets',
      navGroup: 'primary',
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
    await expect(getPlannerWorkbenchPanel('sinks').loadComponent()).resolves.toBe(
      PlannerSinksSectionComponent,
    );
  });
});
