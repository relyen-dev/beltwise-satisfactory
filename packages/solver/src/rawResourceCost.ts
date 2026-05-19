import type { GameDataset, ItemId } from '@beltwise/game-data';
import {
  defaultRawResourceOpinionMultiplier,
  type BaselineResourceLimits,
  type PlannerProject,
} from '@beltwise/planner-core';

const NEUTRAL_RAW_RESOURCE_SCARCITY_COST = 1;

export { DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS } from '@beltwise/planner-core';

export interface RawResourceCostInput {
  itemId: ItemId;
  dataset: GameDataset;
  project: PlannerProject;
  baselineLimits?: BaselineResourceLimits | undefined;
}

export function rawResourceCost(input: RawResourceCostInput): number {
  const scarcityCost = rawResourceScarcityCost(input);
  const defaultMultiplier = defaultRawResourceOpinionMultiplier(input.itemId);
  const userMultiplier = input.project.objectiveProfile.rawResourceMultipliers?.[input.itemId] ?? 1;
  return (
    Math.max(0, input.project.objectiveProfile.resourceScarcityWeight) *
    scarcityCost *
    defaultMultiplier *
    Math.max(0, userMultiplier)
  );
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
    baselineLimits?.limits[itemId]?.maxPerMinute ??
      dataset.resources[itemId]?.extraction?.baselineMaxPerMinute,
  );
}

function finitePositiveLimit(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}
