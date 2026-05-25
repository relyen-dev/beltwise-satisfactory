import type { GameDataset, Item, ItemId } from '@beltwise/game-data';
import type { ItemFlow, ProductionPlanResult } from './graphModel';
import type { ProductTarget, SinkRule, TargetOutputSinkRule } from './plan';
import {
  isTargetOutputSinkableItem,
  targetOutputSinkConfiguredAmountForItem,
} from './sinkRules';

export interface TargetOutputSinkAllocation {
  readonly rule: TargetOutputSinkRule;
  readonly itemId: ItemId;
  readonly amountPerMinute: number;
  readonly targetAllocations: readonly TargetOutputSinkTargetAllocation[];
}

export interface TargetOutputSinkTargetAllocation {
  readonly targetId: string;
  readonly itemId: ItemId;
  readonly amountPerMinute: number;
}

export interface TargetOutputSinkOption {
  readonly item: Item;
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly targetOutputAmountPerMinute: number;
  readonly configuredAmountPerMinute: number;
  readonly remainingAmountPerMinute: number;
}

const MIN_TARGET_OUTPUT_SINK_RATE = 0.000001;

export function targetOutputAmountForItem(
  targets: readonly ProductTarget[],
  result: ProductionPlanResult | null,
  itemId: ItemId,
): number {
  return targets
    .filter((target) => target.itemId === itemId)
    .reduce((total, target) => total + targetOutputAmountForTarget(target, result, targets), 0);
}

export function targetOutputAmountForTarget(
  target: ProductTarget,
  result: ProductionPlanResult | null,
  targets: readonly ProductTarget[] = [target],
): number {
  const solvedFlowAmount = result
    ? result.itemFlows
        .filter((flow) => flow.target.kind === 'output' && flow.target.id === target.id)
        .reduce((total, flow) => total + flow.amountPerMinute, 0)
    : 0;
  if (solvedFlowAmount > MIN_TARGET_OUTPUT_SINK_RATE) {
    return solvedFlowAmount;
  }
  if (target.mode === 'fixed') {
    return Math.max(0, target.amountPerMinute ?? 0);
  }
  const sameItemTargetCount = targets.filter((candidate) => candidate.itemId === target.itemId)
    .length;
  return result && sameItemTargetCount === 1 ? Math.max(0, result.outputs[target.itemId] ?? 0) : 0;
}

export function targetOutputSinkAmountForItem(
  dataset: GameDataset,
  targets: readonly ProductTarget[],
  result: ProductionPlanResult | null,
  sinkRules: readonly SinkRule[],
  itemId: ItemId,
): number {
  if (!isTargetOutputSinkableItem(dataset, itemId)) {
    return 0;
  }
  return Math.min(
    targetOutputSinkConfiguredAmountForItem(sinkRules, itemId),
    targetOutputAmountForItem(targets, result, itemId),
  );
}

export function selectTargetOutputSinkOptions(
  dataset: GameDataset,
  targets: readonly ProductTarget[],
  result: ProductionPlanResult | null,
  sinkRules: readonly SinkRule[],
): TargetOutputSinkOption[] {
  const itemIds = new Set(targets.map((target) => target.itemId).filter((itemId) => itemId.length));
  return Array.from(itemIds)
    .flatMap((itemId) => {
      const item = dataset.items[itemId];
      if (!item || !isTargetOutputSinkableItem(dataset, itemId)) {
        return [];
      }
      const targetOutputAmountPerMinute = targetOutputAmountForItem(targets, result, itemId);
      const configuredAmountPerMinute = Math.min(
        targetOutputSinkConfiguredAmountForItem(sinkRules, itemId),
        targetOutputAmountPerMinute,
      );
      const remainingAmountPerMinute = Math.max(
        0,
        targetOutputAmountPerMinute - configuredAmountPerMinute,
      );
      return remainingAmountPerMinute > MIN_TARGET_OUTPUT_SINK_RATE
        ? [
            {
              item,
              itemId,
              displayName: item.displayName,
              targetOutputAmountPerMinute,
              configuredAmountPerMinute,
              remainingAmountPerMinute,
            },
          ]
        : [];
    })
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName));
}

export function buildTargetOutputSinkAllocations(
  dataset: GameDataset,
  targets: readonly ProductTarget[],
  result: ProductionPlanResult,
  sinkRules: readonly SinkRule[],
): TargetOutputSinkAllocation[] {
  const targetStates = targets
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((target) => ({
      target,
      amountPerMinute: targetOutputAmountForTarget(target, result, targets),
      allocatedAmountPerMinute: 0,
    }));
  const allocatedByItemId = new Map<ItemId, number>();
  const allocations: TargetOutputSinkAllocation[] = [];

  for (const rule of sinkRules.toSorted((left, right) => left.sortOrder - right.sortOrder)) {
    if (rule.mode !== 'target-output' || !isTargetOutputSinkableItem(dataset, rule.itemId)) {
      continue;
    }

    const targetAmountPerMinute = targetStates
      .filter((state) => state.target.itemId === rule.itemId)
      .reduce((total, state) => total + state.amountPerMinute, 0);
    const remainingItemAmountPerMinute =
      targetAmountPerMinute - (allocatedByItemId.get(rule.itemId) ?? 0);
    const amountPerMinute = Math.min(
      Math.max(0, rule.amountPerMinute),
      Math.max(0, remainingItemAmountPerMinute),
    );
    if (amountPerMinute <= MIN_TARGET_OUTPUT_SINK_RATE) {
      continue;
    }

    const targetAllocations: TargetOutputSinkTargetAllocation[] = [];
    let remainingRuleAmountPerMinute = amountPerMinute;
    for (const state of targetStates) {
      if (state.target.itemId !== rule.itemId || remainingRuleAmountPerMinute <= 0) {
        continue;
      }
      const remainingTargetAmountPerMinute = Math.max(
        0,
        state.amountPerMinute - state.allocatedAmountPerMinute,
      );
      const targetAmount = Math.min(remainingTargetAmountPerMinute, remainingRuleAmountPerMinute);
      if (targetAmount <= MIN_TARGET_OUTPUT_SINK_RATE) {
        continue;
      }
      state.allocatedAmountPerMinute += targetAmount;
      remainingRuleAmountPerMinute -= targetAmount;
      targetAllocations.push({
        targetId: state.target.id,
        itemId: rule.itemId,
        amountPerMinute: targetAmount,
      });
    }

    allocatedByItemId.set(rule.itemId, (allocatedByItemId.get(rule.itemId) ?? 0) + amountPerMinute);
    allocations.push({
      rule,
      itemId: rule.itemId,
      amountPerMinute,
      targetAllocations,
    });
  }

  return allocations;
}

export function targetOutputSinkAmountByTargetId(
  allocations: readonly TargetOutputSinkAllocation[],
): ReadonlyMap<string, number> {
  const amountByTargetId = new Map<string, number>();
  for (const allocation of allocations) {
    for (const targetAllocation of allocation.targetAllocations) {
      amountByTargetId.set(
        targetAllocation.targetId,
        (amountByTargetId.get(targetAllocation.targetId) ?? 0) +
          targetAllocation.amountPerMinute,
      );
    }
  }
  return amountByTargetId;
}

export function targetOutputSinkAmountByItemId(
  allocations: readonly TargetOutputSinkAllocation[],
): ReadonlyMap<ItemId, number> {
  const amountByItemId = new Map<ItemId, number>();
  for (const allocation of allocations) {
    amountByItemId.set(
      allocation.itemId,
      (amountByItemId.get(allocation.itemId) ?? 0) + allocation.amountPerMinute,
    );
  }
  return amountByItemId;
}

export function targetOutputSinkFlows(
  allocations: readonly TargetOutputSinkAllocation[],
): ItemFlow[] {
  return allocations.flatMap((allocation) =>
    allocation.targetAllocations.map((targetAllocation) => ({
      itemId: allocation.itemId,
      amountPerMinute: targetAllocation.amountPerMinute,
      source: { kind: 'output', id: targetAllocation.targetId },
      target: { kind: 'sink', id: allocation.itemId },
    })),
  );
}
