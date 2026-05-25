import { Injectable, signal } from '@angular/core';
import { type PlannerProject } from '@beltwise/planner-core';
import {
  type WorkbenchFocusMode,
  type WorkbenchFocusRequest,
  type WorkbenchPanelId,
} from './planner-workbench.models';

@Injectable({ providedIn: 'root' })
export class PlannerWorkbenchSlice {
  private focusRequestSequence = 0;

  public readonly activePanelId = signal<WorkbenchPanelId>('plan');
  public readonly focusRequest = signal<WorkbenchFocusRequest | null>(null);

  public setActivePanel(panelId: WorkbenchPanelId): void {
    this.activePanelId.set(panelId);
  }

  public activateProject(project: PlannerProject): void {
    const mode = selectProjectWorkbenchFocusMode(project);
    if (mode === 'open-plan') {
      this.activePanelId.set('plan');
    }
    this.focusRequest.set({
      projectId: project.id,
      mode,
      sequence: ++this.focusRequestSequence,
    });
  }
}

export function selectProjectWorkbenchFocusMode(project: PlannerProject): WorkbenchFocusMode {
  return project.targets.some((target) => target.itemId.trim().length > 0) ||
    project.powerTargets.some(hasConfiguredPowerTarget)
    ? 'focus-graph'
    : 'open-plan';
}

function hasConfiguredPowerTarget(target: PlannerProject['powerTargets'][number]): boolean {
  if (target.generatorId === undefined || target.fuelItemId === undefined) {
    return false;
  }
  const amount = target.mode === 'power' ? target.powerMw : target.generatorCount;
  return amount !== undefined && Number.isFinite(amount) && amount > 0;
}
