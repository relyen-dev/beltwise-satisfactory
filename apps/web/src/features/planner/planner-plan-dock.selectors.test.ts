import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import { selectPlanDockItems } from './planner-plan-dock.selectors';

const NOW = '2026-05-17T00:00:00.000Z';

describe('selectPlanDockItems', () => {
  it('uses the first configured target as the visual plan identity', () => {
    const project = createProject('project-a', 'Starter factory', [
      {
        id: 'target-later',
        itemId: 'Desc_IronRod_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 1,
      },
      {
        id: 'target-first',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ]);

    const [item] = selectPlanDockItems([project], tinySatisfactoryDataset, project.id);

    expect(item).toMatchObject({
      id: project.id,
      name: 'Starter factory',
      isActive: true,
      iconSrc: '/game-icons/Desc_IronPlate_C.png',
      iconLabel: 'Iron Plate',
      targetCount: 2,
      targetSummary: 'Iron Plate +1',
    });
  });

  it('creates a compact fallback for draft plans', () => {
    const project = createProject('project-draft', 'Rubber expansion', []);

    const [item] = selectPlanDockItems([project], tinySatisfactoryDataset, 'other-project');

    expect(item).toMatchObject({
      isActive: false,
      iconSrc: null,
      fallbackLabel: 'RE',
      targetCount: 0,
      targetSummary: 'Draft plan',
    });
  });
});

function createProject(
  id: string,
  name: string,
  targets: PlannerProject['targets'],
): PlannerProject {
  return createPlannerProject({
    id,
    name,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets,
  });
}
