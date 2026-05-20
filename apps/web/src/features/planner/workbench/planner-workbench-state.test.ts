import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import {
  PlannerWorkbenchSlice,
  selectProjectWorkbenchFocusMode,
} from './planner-workbench-state';

const NOW = '2026-05-20T00:00:00.000Z';

describe('PlannerWorkbenchSlice', () => {
  it('opens the Plan panel when a blank project activates', () => {
    const workbench = new PlannerWorkbenchSlice();
    workbench.setActivePanel('recipes');

    workbench.activateProject(createProject('project-draft'));

    expect(workbench.activePanelId()).toBe('plan');
    expect(workbench.focusRequest()).toMatchObject({
      projectId: 'project-draft',
      mode: 'open-plan',
      sequence: 1,
    });
  });

  it('keeps the selected panel but requests graph focus for configured projects', () => {
    const workbench = new PlannerWorkbenchSlice();
    workbench.setActivePanel('resources');

    workbench.activateProject(createProject('project-configured', 'Desc_IronPlate_C'));

    expect(workbench.activePanelId()).toBe('resources');
    expect(workbench.focusRequest()).toMatchObject({
      projectId: 'project-configured',
      mode: 'focus-graph',
      sequence: 1,
    });
  });
});

describe('selectProjectWorkbenchFocusMode', () => {
  it('treats empty target item ids as blank workbench projects', () => {
    expect(selectProjectWorkbenchFocusMode(createProject('project-empty-target', '   '))).toBe(
      'open-plan',
    );
    expect(
      selectProjectWorkbenchFocusMode(createProject('project-configured', 'Desc_IronRod_C')),
    ).toBe('focus-graph');
  });
});

function createProject(id: string, itemId = ''): PlannerProject {
  return createPlannerProject({
    id,
    name: id,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: `${id}-target`,
        itemId,
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ],
  });
}
