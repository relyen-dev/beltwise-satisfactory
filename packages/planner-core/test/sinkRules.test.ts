import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { isSinkableItem, itemSinkPoints, sinkPointsPerMinute } from '@beltwise/planner-core';

describe('sink rule helpers', () => {
  it('treats only positive finite sink points as sinkable', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      items: {
        ...tinySatisfactoryDataset.items,
        Desc_Screw_C: {
          ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
          sinkPoints: 2,
        },
        Desc_Wire_C: {
          ...tinySatisfactoryDataset.items['Desc_Wire_C']!,
          sinkPoints: 0,
        },
      },
    };

    expect(itemSinkPoints(dataset, 'Desc_Screw_C')).toBe(2);
    expect(isSinkableItem(dataset, 'Desc_Screw_C')).toBe(true);
    expect(sinkPointsPerMinute(dataset, 'Desc_Screw_C', 12)).toBe(24);

    expect(itemSinkPoints(dataset, 'Desc_Wire_C')).toBeNull();
    expect(isSinkableItem(dataset, 'Desc_Wire_C')).toBe(false);
    expect(sinkPointsPerMinute(dataset, 'Desc_Wire_C', 12)).toBeNull();

    expect(itemSinkPoints(dataset, 'Desc_IngotIron_C')).toBeNull();
    expect(isSinkableItem(dataset, 'Desc_IngotIron_C')).toBe(false);
    expect(sinkPointsPerMinute(dataset, 'Desc_IngotIron_C', 12)).toBeNull();
  });
});
