import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  isSolveReadyTarget,
  plannerRelevantMachineIds,
  solveReadyProject,
  type ProductTarget,
} from '@beltwise/planner-core';

describe('planner rules', () => {
  describe('isSolveReadyTarget', () => {
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

    it('requires fixed targets to have positive amounts and allows maximize targets', () => {
      expect(
        isSolveReadyTarget(
          {
            id: 'target-zero',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 0,
            sortOrder: 0,
          },
          tinySatisfactoryDataset,
        ),
      ).toBe(false);
      expect(
        isSolveReadyTarget(
          {
            id: 'target-draft',
            itemId: '',
            mode: 'maximize',
            sortOrder: 1,
          },
          tinySatisfactoryDataset,
        ),
      ).toBe(false);
      expect(
        isSolveReadyTarget(
          {
            id: 'target-maximize',
            itemId: 'Desc_IronPlate_C',
            mode: 'maximize',
            sortOrder: 2,
          },
          tinySatisfactoryDataset,
        ),
      ).toBe(true);
    });
  });

  describe('solveReadyProject', () => {
    it('filters invalid targets and re-sorts remaining targets', () => {
      const project = createPlannerProject({
        id: 'project-test',
        name: 'Test',
        dataset: tinySatisfactoryDataset,
        now: '2026-05-18T00:00:00.000Z',
        targets: [
          {
            id: 'target-invalid-item',
            itemId: 'Desc_Missing_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
          {
            id: 'target-valid-fixed',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 1,
          },
          {
            id: 'target-zero-fixed',
            itemId: 'Desc_Wire_C',
            mode: 'fixed',
            amountPerMinute: 0,
            sortOrder: 2,
          },
          {
            id: 'target-valid-maximize',
            itemId: 'Desc_Wire_C',
            mode: 'maximize',
            sortOrder: 3,
          },
        ],
      });

      expect(solveReadyProject(project, tinySatisfactoryDataset).targets).toMatchObject([
        { id: 'target-valid-fixed', sortOrder: 0 },
        { id: 'target-valid-maximize', sortOrder: 1 },
      ]);
    });

    it('preserves project identity when every target is already solve-ready', () => {
      const project = createPlannerProject({
        id: 'project-test',
        name: 'Test',
        dataset: tinySatisfactoryDataset,
        now: '2026-05-18T00:00:00.000Z',
        targets: [
          {
            id: 'target-valid-fixed',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ],
      });

      expect(solveReadyProject(project, tinySatisfactoryDataset)).toBe(project);
    });
  });

  describe('plannerRelevantMachineIds', () => {
    it('keeps only automated recipe machines that can affect solving', () => {
      const dataset: GameDataset = {
        ...tinySatisfactoryDataset,
        recipes: {
          ...tinySatisfactoryDataset.recipes,
          Recipe_TestPower_C: {
            id: 'Recipe_TestPower_C',
            className: 'Recipe_TestPower_C',
            displayName: 'Test Power',
            ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
            products: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
            durationSeconds: 4,
            producedIn: ['Build_GeneratorCoal_C'],
            isAlternate: false,
            isHandCraftOnly: false,
            tags: [],
          },
          Recipe_MysteryProduction_C: {
            id: 'Recipe_MysteryProduction_C',
            className: 'Recipe_MysteryProduction_C',
            displayName: 'Mystery Production',
            ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 1 }],
            products: [{ itemId: 'Desc_CopperIngot_C', amount: 1 }],
            durationSeconds: 4,
            producedIn: ['Build_MysteryCrafter_C'],
            isAlternate: false,
            isHandCraftOnly: false,
            tags: [],
          },
        },
        machines: {
          ...tinySatisfactoryDataset.machines,
          Build_GeneratorCoal_C: {
            id: 'Build_GeneratorCoal_C',
            className: 'Build_GeneratorCoal_C',
            displayName: 'Coal-Powered Generator',
            type: 'generator',
            powerMw: 0,
          },
          Build_MysteryCrafter_C: {
            id: 'Build_MysteryCrafter_C',
            className: 'Build_MysteryCrafter_C',
            displayName: 'Mystery Crafter',
            type: 'unknown',
            powerMw: 6,
            manufacturingSpeed: 1,
          },
        },
      };

      const machineIds = plannerRelevantMachineIds(dataset);

      expect(machineIds.has('Build_AssemblerMk1_C')).toBe(true);
      expect(machineIds.has('Build_ConstructorMk1_C')).toBe(true);
      expect(machineIds.has('Build_SmelterMk1_C')).toBe(true);
      expect(machineIds.has('Build_MinerMk1_C')).toBe(false);
      expect(machineIds.has('Build_GeneratorCoal_C')).toBe(false);
      expect(machineIds.has('Build_MysteryCrafter_C')).toBe(true);
    });
  });
});
