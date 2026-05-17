import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import { selectCompactPlanDockItems, selectPlanDockItems } from './planner-plan-dock.selectors';

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

  it('keeps the compact visible strip bounded around active and recently touched plans', () => {
    const projects = createProjectList(8);
    const items = selectPlanDockItems(projects, tinySatisfactoryDataset, 'project-5');

    const selection = selectCompactPlanDockItems(
      items,
      'project-5',
      ['project-2', 'project-7', 'project-3'],
      5,
    );

    expect(selection.items.map((item) => item.id)).toEqual([
      'project-5',
      'project-2',
      'project-7',
      'project-3',
      'project-1',
    ]);
    expect(selection.items.some((item) => item.isActive)).toBe(true);
    expect(selection.hiddenCount).toBe(3);
    expect(selection.hasHiddenItems).toBe(true);
  });

  it('filters stale and duplicate recently touched plans from the compact strip', () => {
    const projects = createProjectList(6);
    const items = selectPlanDockItems(projects, tinySatisfactoryDataset, 'project-4');

    const selection = selectCompactPlanDockItems(
      items,
      'project-4',
      ['missing-project', 'project-2', 'project-2', 'project-4', 'project-6'],
      4,
    );

    expect(selection.items.map((item) => item.id)).toEqual([
      'project-4',
      'project-2',
      'project-6',
      'project-1',
    ]);
  });

  it('keeps original plan order when every plan fits in the compact strip', () => {
    const projects = createProjectList(3);
    const items = selectPlanDockItems(projects, tinySatisfactoryDataset, 'project-3');

    const selection = selectCompactPlanDockItems(items, 'project-3', ['project-2'], 5);

    expect(selection.items.map((item) => item.id)).toEqual(['project-1', 'project-2', 'project-3']);
    expect(selection.hasHiddenItems).toBe(false);
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

function createProjectList(count: number): PlannerProject[] {
  return Array.from({ length: count }, (_value, index) => {
    const planNumber = index + 1;
    return createProject(`project-${planNumber}`, `Factory ${planNumber}`, []);
  });
}
