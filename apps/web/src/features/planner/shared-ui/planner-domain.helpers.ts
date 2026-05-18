import type { GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  isUnlimitedResourceCap,
  type PlannerProject,
  type PlannerUserDefaults,
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

export function resourceCapInputValue(capPerMinute: number | undefined): number | null {
  return capPerMinute === undefined || isUnlimitedResourceCap(capPerMinute) ? null : capPerMinute;
}

export function formatResourceCap(capPerMinute: number | undefined): string {
  if (capPerMinute === undefined || isUnlimitedResourceCap(capPerMinute)) {
    return 'Unlimited';
  }
  return `${formatResourceNumber(capPerMinute)}/min`;
}

function formatResourceNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
