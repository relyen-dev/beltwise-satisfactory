import type { PlannerProject } from '@beltwise/planner-core';

export function projectRequiresDeleteConfirmation(project: PlannerProject): boolean {
  return hasConfiguredTargetItem(project);
}

export function sessionRequiresDeleteConfirmation(projects: readonly PlannerProject[]): boolean {
  if (projects.length === 0) {
    return false;
  }
  if (projects.length === 1) {
    const [project] = projects;
    return project ? hasConfiguredTargetItem(project) : false;
  }
  return true;
}

function hasConfiguredTargetItem(project: PlannerProject): boolean {
  return project.targets.some((target) => target.itemId.trim().length > 0);
}
