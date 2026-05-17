import type { GameDataset, ItemId } from '@beltwise/game-data';
import type { PlannerProject, ProductTarget } from '@beltwise/planner-core';
import { gameIconPathForItemId } from './game-icon.helpers';

export interface PlanDockItem {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly iconSrc: string | null;
  readonly iconLabel: string;
  readonly fallbackLabel: string;
  readonly targetCount: number;
  readonly targetSummary: string;
}

export function selectPlanDockItems(
  projects: readonly PlannerProject[],
  dataset: GameDataset | null,
  activeProjectId: string | undefined,
): PlanDockItem[] {
  return projects.map((project) =>
    selectPlanDockItem(project, dataset, activeProjectId === project.id),
  );
}

function selectPlanDockItem(
  project: PlannerProject,
  dataset: GameDataset | null,
  isActive: boolean,
): PlanDockItem {
  const targets = sortedConfiguredTargets(project.targets);
  const primaryTarget = targets[0];
  const primaryItem = primaryTarget ? dataset?.items[primaryTarget.itemId] : undefined;
  const iconLabel = primaryItem?.displayName ?? primaryTarget?.itemId ?? 'Draft plan';

  return {
    id: project.id,
    name: project.name,
    isActive,
    iconSrc: primaryTarget ? gameIconPathForItemId(primaryTarget.itemId) : null,
    iconLabel,
    fallbackLabel: createFallbackLabel(project.name),
    targetCount: targets.length,
    targetSummary: createTargetSummary(iconLabel, targets.length),
  };
}

function sortedConfiguredTargets(targets: readonly ProductTarget[]): ProductTarget[] {
  return targets
    .filter((target) => target.itemId.trim().length > 0)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

function createTargetSummary(primaryLabel: string, targetCount: number): string {
  if (targetCount === 0) {
    return 'Draft plan';
  }
  if (targetCount === 1) {
    return primaryLabel;
  }
  return `${primaryLabel} +${targetCount - 1}`;
}

function createFallbackLabel(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return initials || 'P';
}
