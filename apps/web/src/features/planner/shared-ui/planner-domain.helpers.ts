import { type GameDataset, type Machine, type MachineId, type Recipe } from '@beltwise/game-data';
import {
  createPlannerProject,
  isUnlimitedResourceCap,
  type PlannerProject,
  type PlannerUserDefaults,
  type ProductTarget,
} from '@beltwise/planner-core';

export {
  defaultResourceCapPerMinute,
  isUnlimitedResourceCap,
  normalizeResourceOverride,
  resourceCapsEqual,
} from '@beltwise/planner-core';

export function createStarterProject(
  dataset: GameDataset,
  name = 'Starter factory',
  userDefaults?: PlannerUserDefaults,
): PlannerProject {
  return createPlannerProject({
    name,
    dataset,
    targets: [],
    ...(userDefaults !== undefined ? { userDefaults } : {}),
  });
}

export function solveReadyProject(project: PlannerProject, dataset: GameDataset): PlannerProject {
  const targets = project.targets
    .filter((target) => isSolveReadyTarget(target, dataset))
    .map((target, index) => ({ ...target, sortOrder: index }));

  return targets.length === project.targets.length ? project : { ...project, targets };
}

export function isSolveReadyTarget(target: ProductTarget, dataset: GameDataset): boolean {
  if (!hasDatasetItem(dataset, target.itemId)) {
    return false;
  }
  return target.mode === 'maximize' || (target.amountPerMinute ?? 0) > 0;
}

export function plannerRelevantMachineIds(dataset: GameDataset): Set<MachineId> {
  const machineIds = new Set<MachineId>();
  for (const recipe of Object.values(dataset.recipes)) {
    if (!isPlannerRelevantRecipe(recipe)) {
      continue;
    }
    for (const machineId of recipe.producedIn) {
      const machine = hasOwnRecordKey(dataset.machines, machineId)
        ? dataset.machines[machineId]
        : undefined;
      if (!machine || isRawProviderMachine(machine)) {
        continue;
      }
      machineIds.add(machineId);
    }
  }
  return machineIds;
}

export function resourceCapInputValue(capPerMinute: number | undefined): number | null {
  return capPerMinute === undefined || isUnlimitedResourceCap(capPerMinute) ? null : capPerMinute;
}

export function formatResourceCap(capPerMinute: number | undefined): string {
  if (capPerMinute === undefined || isUnlimitedResourceCap(capPerMinute)) {
    return 'Unlimited';
  }
  return `${formatResourceNumber(capPerMinute)}/min`;
}

function isPlannerRelevantRecipe(recipe: Recipe): boolean {
  return !recipe.isHandCraftOnly && recipe.producedIn.length > 0;
}

function hasDatasetItem(dataset: GameDataset, itemId: string): boolean {
  return hasOwnRecordKey(dataset.items, itemId);
}

function hasOwnRecordKey(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRawProviderMachine(machine: Machine): boolean {
  return (
    machine.type === 'extractor' ||
    machine.type === 'resourceWellExtractor' ||
    machine.type === 'waterPump' ||
    machine.type === 'generator'
  );
}

function formatResourceNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
