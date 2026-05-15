import type { GameDataset, ItemId } from '@beltwise/game-data';
import type { BaselineResourceLimits, PlannerProject } from '@beltwise/planner-core';

const NEUTRAL_RAW_RESOURCE_SCARCITY_COST = 1;

export const DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS: Readonly<Partial<Record<ItemId, number>>> = {
  Desc_OreIron_C: 1,
  Desc_Stone_C: 1,
  Desc_OreCopper_C: 1,
  Desc_Coal_C: 1,
  Desc_LiquidOil_C: 1,
  Desc_NitrogenGas_C: 1,
  Desc_OreGold_C: 1,
  Desc_RawQuartz_C: 1,
  Desc_Sulfur_C: 1,
  Desc_OreBauxite_C: 1,
  Desc_OreUranium_C: 1,
  Desc_SAM_C: 1,
  Desc_Water_C: 0
};

export interface RawResourceCostInput {
  itemId: ItemId;
  dataset: GameDataset;
  project: PlannerProject;
  baselineLimits?: BaselineResourceLimits | undefined;
}

export function rawResourceCost(input: RawResourceCostInput): number {
  const scarcityCost = rawResourceScarcityCost(input);
  const defaultMultiplier = DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS[input.itemId] ?? 1;
  const userMultiplier = input.project.objectiveProfile.rawResourceMultipliers?.[input.itemId] ?? 1;
  return input.project.objectiveProfile.resourceScarcityWeight * scarcityCost * defaultMultiplier * userMultiplier;
}

export function rawResourceScarcityCost(input: RawResourceCostInput): number {
  const baselineLimitPerMinute = rawResourceBaselineLimitPerMinute(
    input.itemId,
    input.dataset,
    input.baselineLimits,
  );
  if (baselineLimitPerMinute === undefined) {
    return NEUTRAL_RAW_RESOURCE_SCARCITY_COST;
  }
  return 1 / baselineLimitPerMinute;
}

export function rawResourceBaselineLimitPerMinute(
  itemId: ItemId,
  dataset: GameDataset,
  baselineLimits?: BaselineResourceLimits,
): number | undefined {
  return finitePositiveLimit(
    baselineLimits?.limits[itemId]?.maxPerMinute ?? dataset.resources[itemId]?.extraction?.baselineMaxPerMinute,
  );
}

function finitePositiveLimit(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}
