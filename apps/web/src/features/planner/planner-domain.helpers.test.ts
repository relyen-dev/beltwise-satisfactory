import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import type { ProductTarget } from '@beltwise/planner-core';
import { isSolveReadyTarget } from './planner-domain.helpers';

describe('planner domain helpers', () => {
  it('checks target item ids against dataset own properties only', () => {
    const inheritedItemTargets: ProductTarget[] = [
      {
        id: 'target-to-string',
        itemId: 'toString',
        mode: 'fixed',
        amountPerMinute: 1,
        sortOrder: 0,
      },
      {
        id: 'target-has-own',
        itemId: 'hasOwnProperty',
        mode: 'fixed',
        amountPerMinute: 1,
        sortOrder: 1,
      },
    ];

    expect(
      inheritedItemTargets.map((target) => isSolveReadyTarget(target, tinySatisfactoryDataset)),
    ).toEqual([false, false]);
    expect(
      isSolveReadyTarget(
        {
          id: 'target-plate',
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: 1,
          sortOrder: 0,
        },
        tinySatisfactoryDataset,
      ),
    ).toBe(true);
  });
});
