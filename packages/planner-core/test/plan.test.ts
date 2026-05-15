import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, hydratePlannerProject } from '@beltwise/planner-core';

describe('createPlannerProject', () => {
  it('starts new projects with no product targets by default', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(project.targets).toEqual([]);
    expect(project.buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
    expect(project.graphDisplay.rateDecimalPlaces).toBe(3);
    expect(project.graphDisplay.edgeStyle).toBe('straight');
  });

  it('enables base recipes and disables alternates for new projects', () => {
    const baseRecipe = Object.values(tinySatisfactoryDataset.recipes).find(
      (recipe) => !recipe.isAlternate,
    );
    const alternateRecipe = Object.values(tinySatisfactoryDataset.recipes).find(
      (recipe) => recipe.isAlternate,
    );

    if (!baseRecipe || !alternateRecipe) {
      throw new Error('Tiny dataset must contain base and alternate recipes');
    }

    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(project.recipeOverrides[baseRecipe.id]).toBeUndefined();
    expect(project.recipeOverrides[alternateRecipe.id]).toEqual({ enabled: false });
  });

  it('preserves draft product targets without a selected item when hydrating', () => {
    const project = hydratePlannerProject(
      {
        id: 'project-test',
        name: 'Test',
        targets: [
          {
            id: 'target-draft',
            itemId: '',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ],
      },
      tinySatisfactoryDataset,
    );

    expect(project?.targets).toEqual([
      {
        id: 'target-draft',
        itemId: '',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ]);
  });
});
