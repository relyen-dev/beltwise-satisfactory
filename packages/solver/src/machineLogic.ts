import type { GameDataset, Machine, Recipe } from '@beltwise/game-data';
import type { PlannerProject } from '@beltwise/planner-core';

export function selectRecipeMachine(
  dataset: GameDataset,
  project: Pick<PlannerProject, 'machineOverrides'>,
  recipe: Recipe,
): Machine | undefined {
  const machineId =
    recipe.producedIn.find(
      (candidate) =>
        dataset.machines[candidate] && project.machineOverrides[candidate]?.enabled !== false,
    ) ?? recipe.producedIn.find((candidate) => dataset.machines[candidate]);
  return machineId ? dataset.machines[machineId] : undefined;
}

export function machineCountPerRecipeRate(recipe: Recipe, machine: Machine | undefined): number {
  const executionsPerMachinePerMinute = 60 / recipe.durationSeconds;
  const machineSpeed = machine?.manufacturingSpeed ?? 1;
  return 1 / executionsPerMachinePerMinute / machineSpeed;
}

export function machinePowerMw(machine: Machine | undefined): number {
  if (!machine) {
    return 0;
  }
  if (machine.powerMw !== undefined) {
    return machine.powerMw;
  }
  if (machine.powerRangeMw) {
    return (machine.powerRangeMw.min + machine.powerRangeMw.max) / 2;
  }
  return 0;
}
