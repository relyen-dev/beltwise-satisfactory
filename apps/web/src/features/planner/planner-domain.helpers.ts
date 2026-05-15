import {
  type GameDataset,
  type Machine,
  type MachineId,
  type Recipe,
  type ResourceInfo,
} from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductTarget,
  type ResourceOverride,
} from '@beltwise/planner-core';

export function createStarterProject(
  dataset: GameDataset,
  name = 'Starter factory',
): PlannerProject {
  return createPlannerProject({
    name,
    dataset,
    targets: [],
  });
}

export function solveReadyProject(project: PlannerProject, dataset: GameDataset): PlannerProject {
  const targets = project.targets
    .filter((target) => isSolveReadyTarget(target, dataset))
    .map((target, index) => ({ ...target, sortOrder: index }));

  return targets.length === project.targets.length ? project : { ...project, targets };
}

export function isSolveReadyTarget(target: ProductTarget, dataset: GameDataset): boolean {
  if (!dataset.items[target.itemId]) {
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
      const machine = dataset.machines[machineId];
      if (!machine || isRawProviderMachine(machine)) {
        continue;
      }
      machineIds.add(machineId);
    }
  }
  return machineIds;
}

export function defaultResourceCapPerMinute(resource: ResourceInfo): number | undefined {
  return resource.extraction?.baselineMaxPerMinute;
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

export function isUnlimitedResourceCap(capPerMinute: number | undefined): boolean {
  return capPerMinute === undefined || capPerMinute >= 1_000_000_000;
}

export function resourceCapsEqual(
  left: number | undefined,
  right: number | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    Math.abs(left - right) < 0.000001 ||
    (isUnlimitedResourceCap(left) && isUnlimitedResourceCap(right))
  );
}

export function normalizeResourceOverride(
  override: ResourceOverride,
  baselineCapPerMinute: number | undefined,
): ResourceOverride | undefined {
  const enabled = override.enabled ?? true;
  const maxPerMinute = override.maxPerMinute;
  if (
    enabled &&
    (maxPerMinute === undefined || resourceCapsEqual(maxPerMinute, baselineCapPerMinute))
  ) {
    return undefined;
  }
  return override;
}

function isPlannerRelevantRecipe(recipe: Recipe): boolean {
  return !recipe.isHandCraftOnly && recipe.producedIn.length > 0;
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
