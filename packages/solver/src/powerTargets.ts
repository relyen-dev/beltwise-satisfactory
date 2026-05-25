import type { GameDataset, GeneratorFuelOption } from '@beltwise/game-data';
import type { PlanWarning, PlannerProject, PowerTarget } from '@beltwise/planner-core';

const EPSILON = 0.000001;

export interface ActivePowerTarget {
  readonly targetId: string;
  readonly option: GeneratorFuelOption;
  readonly requiredGeneratorCount?: number;
  readonly requiredPowerMw?: number;
}

export interface PowerTargetAnalysis {
  readonly activeTargets: ActivePowerTarget[];
  readonly warnings: PlanWarning[];
}

export function analyzePowerTargets(
  dataset: GameDataset,
  project: PlannerProject,
): PowerTargetAnalysis {
  const activeTargets: ActivePowerTarget[] = [];
  const warnings: PlanWarning[] = [];

  for (const target of project.powerTargets.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const option = selectedGeneratorFuelOption(dataset, target);
    if (!option) {
      if (target.generatorId && target.fuelItemId) {
        warnings.push({
          code: 'power-target-invalid-option',
          message: `Power target ${target.id} was ignored because ${target.generatorId} cannot use ${target.fuelItemId}.`,
          powerTargetId: target.id,
          itemId: target.fuelItemId,
        });
      }
      continue;
    }

    if (target.mode === 'generator-count') {
      const generatorCount = activeAmount(target.generatorCount);
      if (generatorCount === undefined) {
        warnings.push({
          code: 'power-target-invalid-generator-count',
          message: `Power target ${target.id} was ignored because it does not have a positive generator count.`,
          powerTargetId: target.id,
        });
        continue;
      }
      activeTargets.push({
        targetId: target.id,
        option,
        requiredGeneratorCount: generatorCount,
      });
      continue;
    }

    const powerMw = activeAmount(target.powerMw);
    if (powerMw === undefined) {
      warnings.push({
        code: 'power-target-invalid-power',
        message: `Power target ${target.id} was ignored because it does not have a positive MW target.`,
        powerTargetId: target.id,
      });
      continue;
    }
    activeTargets.push({
      targetId: target.id,
      option,
      requiredPowerMw: powerMw,
    });
  }

  return { activeTargets, warnings };
}

function selectedGeneratorFuelOption(
  dataset: GameDataset,
  target: PowerTarget,
): GeneratorFuelOption | undefined {
  if (!target.generatorId || !target.fuelItemId) {
    return undefined;
  }

  const optionId = `${target.generatorId}:${target.fuelItemId}`;
  const option = dataset.generatorFuelOptions[optionId];
  if (
    !option ||
    option.generatorId !== target.generatorId ||
    option.fuelItemId !== target.fuelItemId
  ) {
    return undefined;
  }

  return option;
}

function activeAmount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > EPSILON ? value : undefined;
}
