import type { GameDataset, ItemId } from '@beltwise/game-data';
import type { SinkRule, TargetOutputSinkRule } from './plan';

export function itemSinkPoints(dataset: GameDataset, itemId: ItemId): number | null {
  const sinkPoints = dataset.items[itemId]?.sinkPoints;
  return sinkPoints !== undefined && Number.isFinite(sinkPoints) && sinkPoints > 0
    ? sinkPoints
    : null;
}

export function isSinkableItem(dataset: GameDataset, itemId: ItemId): boolean {
  return itemSinkPoints(dataset, itemId) !== null;
}

export function isTargetOutputSinkableItem(dataset: GameDataset, itemId: ItemId): boolean {
  return dataset.items[itemId]?.form === 'solid' && isSinkableItem(dataset, itemId);
}

export function sinkPointsPerMinute(
  dataset: GameDataset,
  itemId: ItemId,
  amountPerMinute: number,
): number | null {
  const points = itemSinkPoints(dataset, itemId);
  return points === null ? null : points * amountPerMinute;
}

export function surplusSinkRuleForItem(
  sinkRules: readonly SinkRule[],
  itemId: ItemId,
): SinkRule | undefined {
  return sinkRules.find((rule) => rule.mode === 'surplus' && rule.itemId === itemId);
}

export function targetOutputSinkRuleForItem(
  sinkRules: readonly SinkRule[],
  itemId: ItemId,
): TargetOutputSinkRule | undefined {
  return sinkRules.find(
    (rule): rule is TargetOutputSinkRule =>
      rule.mode === 'target-output' && rule.itemId === itemId,
  );
}

export function targetOutputSinkConfiguredAmountForItem(
  sinkRules: readonly SinkRule[],
  itemId: ItemId,
): number {
  return sinkRules
    .filter(
      (rule): rule is TargetOutputSinkRule =>
        rule.mode === 'target-output' && rule.itemId === itemId,
    )
    .reduce((total, rule) => total + rule.amountPerMinute, 0);
}
