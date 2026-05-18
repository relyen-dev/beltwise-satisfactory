import type { Item } from '@beltwise/game-data';
import type { ProductTarget } from '@beltwise/planner-core';

export function parsePlannerNumber(value: string | number | null): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function countConfiguredTargets(targets: readonly ProductTarget[]): number {
  return targets.filter((target) => target.itemId.trim().length > 0).length;
}

export function filterItemsBySearch(
  itemOptions: readonly Item[],
  itemSearch: string,
): readonly Item[] {
  const query = itemSearch.trim().toLowerCase();
  return query.length === 0
    ? itemOptions
    : itemOptions.filter((item) => itemMatchesSearch(item, query));
}

function itemMatchesSearch(item: Item, query: string): boolean {
  return (
    item.displayName.toLowerCase().includes(query) ||
    item.className.toLowerCase().includes(query) ||
    item.id.toLowerCase().includes(query)
  );
}
