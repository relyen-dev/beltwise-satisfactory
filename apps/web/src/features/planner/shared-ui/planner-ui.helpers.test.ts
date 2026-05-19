import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import type { ProductTarget } from '@beltwise/planner-core';
import {
  countConfiguredTargets,
  filterItemsBySearch,
  parsePlannerNumber,
  parseRawResourceMultiplierInput,
} from './planner-ui.helpers';

describe('planner UI helpers', () => {
  it('parses planner number inputs defensively', () => {
    expect(parsePlannerNumber(12)).toBe(12);
    expect(parsePlannerNumber('24.5')).toBe(24.5);
    expect(parsePlannerNumber('not a number')).toBe(0);
    expect(parsePlannerNumber(null)).toBe(0);
  });

  it('parses blank and invalid raw resource multipliers as neutral', () => {
    expect(parseRawResourceMultiplierInput(2.5)).toBe(2.5);
    expect(parseRawResourceMultiplierInput('0.5')).toBe(0.5);
    expect(parseRawResourceMultiplierInput('')).toBe(1);
    expect(parseRawResourceMultiplierInput('   ')).toBe(1);
    expect(parseRawResourceMultiplierInput('not a number')).toBe(1);
    expect(parseRawResourceMultiplierInput(-1)).toBe(1);
    expect(parseRawResourceMultiplierInput('-1')).toBe(1);
    expect(parseRawResourceMultiplierInput(null)).toBe(1);
  });

  it('counts only targets with selected items as configured outputs', () => {
    expect(
      countConfiguredTargets([
        createTarget('target-a', 'Desc_IronPlate_C'),
        createTarget('target-b', ''),
        createTarget('target-c', '   '),
      ]),
    ).toBe(1);
  });

  it('filters item options by display name and class identifiers', () => {
    const itemOptions = Object.values(tinySatisfactoryDataset.items).toSorted((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );

    const copperMatches = filterItemsBySearch(itemOptions, 'copper');
    const classMatches = filterItemsBySearch(itemOptions, 'Desc_IronPlate');

    expect(copperMatches.map((item) => item.displayName)).toContain('Copper Ore');
    expect(classMatches.map((item) => item.id)).toContain('Desc_IronPlate_C');
  });
});

function createTarget(id: string, itemId: string): ProductTarget {
  return {
    id,
    itemId,
    mode: 'fixed',
    amountPerMinute: 10,
    sortOrder: 0,
  };
}
