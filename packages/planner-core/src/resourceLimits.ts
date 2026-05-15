import type { GameDataset, ItemId, MachineId } from '@beltwise/game-data';
import type { PlannerProject } from './plan';

export interface BaselineResourceLimits {
  id: string;
  gameVersionLabel: string;
  assumptions: string[];
  limits: Record<ItemId, ResourceLimit>;
}

export interface ResourceLimit {
  itemId: ItemId;
  maxPerMinute: number;
  source: 'manual-map-count';
  nodeCounts?: {
    impure?: number;
    normal?: number;
    pure?: number;
  };
  extractorAssumption?: {
    machineId: MachineId;
    clockPercent: number;
    beltOrPipeLimited: boolean;
  };
}

export interface ResourceProvider {
  id: string;
  label: string;
  getLimits(dataset: GameDataset): BaselineResourceLimits;
}

export function buildResourceCapsPerMinute(
  dataset: GameDataset,
  project: PlannerProject,
  baselineLimits?: BaselineResourceLimits,
): Record<ItemId, number> {
  const caps: Record<ItemId, number> = {};

  for (const resource of Object.values(dataset.resources)) {
    const baseline = baselineLimits?.limits[resource.itemId]?.maxPerMinute;
    const generatedBaseline = resource.extraction?.baselineMaxPerMinute;
    const override = project.resourceOverrides[resource.itemId];
    const cap =
      override?.enabled === false
        ? 0
        : (override?.maxPerMinute ?? baseline ?? generatedBaseline);
    if (cap !== undefined) {
      caps[resource.itemId] = cap;
    }
  }

  return caps;
}
