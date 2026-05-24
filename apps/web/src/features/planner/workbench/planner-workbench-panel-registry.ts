import { type Type } from '@angular/core';
import { type WorkbenchPanelId } from './planner-workbench.models';

export type WorkbenchPanelWidth = 'standard' | 'wide';
export type WorkbenchPanelNavigationGroup = 'primary' | 'secondary';
export type WorkbenchPanelComponent = Type<unknown>;
export type WorkbenchPanelComponentLoader = () => Promise<WorkbenchPanelComponent>;

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly label: string;
  readonly navHint: string;
  readonly navGroup: WorkbenchPanelNavigationGroup;
  readonly loadComponent: WorkbenchPanelComponentLoader;
  readonly width: WorkbenchPanelWidth;
  readonly panelClass: string | null;
}

export const PLANNER_WORKBENCH_PANELS = [
  {
    id: 'plan',
    label: 'Plan',
    navHint: 'Targets',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerTargetsSectionComponent } = await import(
        './planner-targets-section.component'
      );
      return PlannerTargetsSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'recipes',
    label: 'Recipes',
    navHint: 'Rules',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerRecipesSectionComponent } = await import(
        './planner-recipes-section.component'
      );
      return PlannerRecipesSectionComponent;
    },
    width: 'wide',
    panelClass: 'work-panel--recipes',
  },
  {
    id: 'inputs',
    label: 'Inputs',
    navHint: 'Supply',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerInputsSectionComponent } = await import(
        './planner-inputs-section.component'
      );
      return PlannerInputsSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'sinks',
    label: 'Sinks',
    navHint: 'Surplus',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerSinksSectionComponent } = await import('./planner-sinks-section.component');
      return PlannerSinksSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'machines',
    label: 'Machines',
    navHint: 'Build',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerMachinesSectionComponent } = await import(
        './planner-machines-section.component'
      );
      return PlannerMachinesSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'resources',
    label: 'Resources',
    navHint: 'Caps',
    navGroup: 'primary',
    loadComponent: async () => {
      const { PlannerResourcesSectionComponent } = await import(
        './planner-resources-section.component'
      );
      return PlannerResourcesSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'objectives',
    label: 'Objectives',
    navHint: 'Limits',
    navGroup: 'secondary',
    loadComponent: async () => {
      const { PlannerObjectivesSectionComponent } = await import(
        './planner-objectives-section.component'
      );
      return PlannerObjectivesSectionComponent;
    },
    width: 'standard',
    panelClass: null,
  },
  {
    id: 'display',
    label: 'Display',
    navHint: 'View',
    navGroup: 'secondary',
    loadComponent: async () => {
      const { PlannerDisplaySectionComponent } = await import(
        './planner-display-section.component'
      );
      return PlannerDisplaySectionComponent;
    },
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
