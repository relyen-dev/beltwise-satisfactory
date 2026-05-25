import {
  stableStringify,
  type GameDataset,
  type ItemId,
  type MachineId,
} from '@beltwise/game-data';
import {
  solveReadyProject,
  type PlannerProject,
  type PowerTarget,
  type ProductTarget,
} from '@beltwise/planner-core';

export type PlannerSolveKey = string;

export interface PlannerSolveInput {
  dataset: GameDataset;
  project: PlannerProject;
  key: PlannerSolveKey;
}

interface PlannerSolveKeyState {
  version: number;
  datasetKey: PlannerSolveKey;
  targets: ReadonlyArray<{
    id: string;
    itemId: ItemId;
    mode: ProductTarget['mode'];
    amountPerMinute?: number;
    sortOrder: number;
  }>;
  powerTargets: ReadonlyArray<{
    id: string;
    mode: PowerTarget['mode'];
    generatorId?: MachineId;
    fuelItemId?: ItemId;
    generatorCount?: number;
    powerMw?: number;
    sortOrder: number;
  }>;
  recipeOverrides: PlannerProject['recipeOverrides'];
  machineOverrides: PlannerProject['machineOverrides'];
  resourceOverrides: PlannerProject['resourceOverrides'];
  itemInputs: PlannerProject['itemInputs'];
  objectiveProfile: PlannerProject['objectiveProfile'];
}

const SOLVE_KEY_VERSION = 1;
const datasetSolveKeyCache = new WeakMap<GameDataset, PlannerSolveKey>();

export function selectPlannerSolveInput(
  project: PlannerProject | null,
  dataset: GameDataset | null,
  datasetKey?: PlannerSolveKey,
): PlannerSolveInput | null {
  if (!project || !dataset) {
    return null;
  }

  const solveProject = solveReadyProject(project, dataset);
  return {
    dataset,
    project: solveProject,
    key: createPlannerSolveKey(solveProject, datasetKey ?? cachedGameDatasetSolveKey(dataset)),
  };
}

export function createPlannerSolveKey(
  project: PlannerProject,
  datasetKey: PlannerSolveKey,
): PlannerSolveKey {
  return stableStringify(selectPlannerSolveKeyState(project, datasetKey), 0);
}

export function createGameDatasetSolveKey(dataset: GameDataset): PlannerSolveKey {
  return stableStringify(dataset, 0);
}

export function equalPlannerSolveInputs(
  left: PlannerSolveInput | null,
  right: PlannerSolveInput | null,
): boolean {
  return left?.key === right?.key;
}

function cachedGameDatasetSolveKey(dataset: GameDataset): PlannerSolveKey {
  const cached = datasetSolveKeyCache.get(dataset);
  if (cached !== undefined) {
    return cached;
  }

  const key = createGameDatasetSolveKey(dataset);
  datasetSolveKeyCache.set(dataset, key);
  return key;
}

function selectPlannerSolveKeyState(
  project: PlannerProject,
  datasetKey: PlannerSolveKey,
): PlannerSolveKeyState {
  return {
    version: SOLVE_KEY_VERSION,
    datasetKey,
    targets: project.targets.map(solveTargetKeyPart),
    powerTargets: project.powerTargets
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map(solvePowerTargetKeyPart),
    recipeOverrides: project.recipeOverrides,
    machineOverrides: project.machineOverrides,
    resourceOverrides: project.resourceOverrides,
    itemInputs: project.itemInputs,
    objectiveProfile: project.objectiveProfile,
  };
}

function solveTargetKeyPart(target: ProductTarget): PlannerSolveKeyState['targets'][number] {
  return {
    id: target.id,
    itemId: target.itemId,
    mode: target.mode,
    ...(target.mode === 'fixed' ? { amountPerMinute: target.amountPerMinute ?? 0 } : {}),
    sortOrder: target.sortOrder,
  };
}

function solvePowerTargetKeyPart(
  target: PowerTarget,
): PlannerSolveKeyState['powerTargets'][number] {
  return {
    id: target.id,
    mode: target.mode,
    ...(target.generatorId !== undefined ? { generatorId: target.generatorId } : {}),
    ...(target.fuelItemId !== undefined ? { fuelItemId: target.fuelItemId } : {}),
    ...(target.mode === 'generator-count'
      ? { generatorCount: safePowerTargetAmount(target.generatorCount) }
      : { powerMw: safePowerTargetAmount(target.powerMw) }),
    sortOrder: target.sortOrder,
  };
}

function safePowerTargetAmount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}
