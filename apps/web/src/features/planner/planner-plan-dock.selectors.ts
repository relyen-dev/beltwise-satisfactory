import type { GameDataset } from '@beltwise/game-data';
import type { PlannerProject, ProductTarget } from '@beltwise/planner-core';
import { gameIconPathForItemId } from './game-icon.helpers';

export interface PlanDockItem {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly iconSrc: string | null;
  readonly iconLabel: string;
  readonly fallbackLabel: string;
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

export function selectCompactPlanDockItems(
  items: readonly PlanDockItem[],
  activeProjectId: string | undefined,
  recentlyTouchedProjectIds: readonly string[],
  itemLimit: number,
): PlanDockItem[] {
  const visibleLimit = Math.max(1, Math.floor(itemLimit));
  if (items.length <= visibleLimit) {
    return [...items];
  }

  const selectedItems: PlanDockItem[] = [];
  const seenIds = new Set<string>();
  const itemById = new Map(items.map((item) => [item.id, item]));
  const addVisibleItem = (projectId: string | undefined): void => {
    if (!projectId || seenIds.has(projectId)) {
      return;
    }
    const item = itemById.get(projectId);
    if (!item) {
      return;
    }
    selectedItems.push(item);
    seenIds.add(projectId);
  };

  addVisibleItem(activeProjectId);
  for (const projectId of recentlyTouchedProjectIds) {
    addVisibleItem(projectId);
  }
  for (const item of items) {
    addVisibleItem(item.id);
  }

  return selectedItems.slice(0, visibleLimit);
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
