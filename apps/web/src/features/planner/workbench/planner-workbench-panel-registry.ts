import { type Type } from '@angular/core';
import { PlannerDisplaySectionComponent } from './planner-display-section.component';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerMachinesSectionComponent } from './planner-machines-section.component';
import { PlannerObjectivesSectionComponent } from './planner-objectives-section.component';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerResourcesSectionComponent } from './planner-resources-section.component';
import { PlannerTargetsSectionComponent } from './planner-targets-section.component';
import { type WorkbenchPanelId } from './planner-workbench.models';

export type WorkbenchPanelWidth = 'standard' | 'wide';

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly label: string;
  readonly component: Type<unknown>;
  readonly width: WorkbenchPanelWidth;
  readonly panelClass: string | null;
}

export const PLANNER_WORKBENCH_PANELS = [
  {
    id: 'plan',
    label: 'Plan',
    component: PlannerTargetsSectionComponent,
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'objectives',
    label: 'Objectives',
    component: PlannerObjectivesSectionComponent,
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'recipes',
    label: 'Recipes',
    component: PlannerRecipesSectionComponent,
    width: 'wide',
    panelClass: 'work-panel--recipes',
  },
  {
    id: 'inputs',
    label: 'Inputs',
    component: PlannerInputsSectionComponent,
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'resources',
    label: 'Resources',
    component: PlannerResourcesSectionComponent,
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'machines',
    label: 'Machines',
    component: PlannerMachinesSectionComponent,
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'display',
    label: 'Display',
    component: PlannerDisplaySectionComponent,
    width: 'standard',
    panelClass: null,
  },
] as const satisfies readonly WorkbenchPanelDefinition[];

const PLANNER_WORKBENCH_PANEL_BY_ID = new Map<WorkbenchPanelId, WorkbenchPanelDefinition>(
  PLANNER_WORKBENCH_PANELS.map((panel) => [panel.id, panel] as const),
);

export function getPlannerWorkbenchPanel(panelId: WorkbenchPanelId): WorkbenchPanelDefinition {
  const panel = PLANNER_WORKBENCH_PANEL_BY_ID.get(panelId);
  if (!panel) {
    throw new Error(`Unknown workbench panel: ${panelId}`);
  }
  return panel;
}
