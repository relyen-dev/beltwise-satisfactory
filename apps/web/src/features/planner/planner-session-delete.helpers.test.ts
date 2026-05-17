import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import {
  projectRequiresDeleteConfirmation,
  sessionRequiresDeleteConfirmation,
} from './planner-session-delete.helpers';

const NOW = '2026-05-17T00:00:00.000Z';

describe('sessionRequiresDeleteConfirmation', () => {
  it('does not require confirmation for an empty session', () => {
    expect(sessionRequiresDeleteConfirmation([])).toBe(false);
  });

  it('does not require confirmation for a single draft plan', () => {
    expect(sessionRequiresDeleteConfirmation([createProject('project-draft', [])])).toBe(false);
  });

  it('requires confirmation for a single configured plan', () => {
    expect(
      sessionRequiresDeleteConfirmation([
        createProject('project-configured', [
          {
            id: 'target-a',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ]),
      ]),
    ).toBe(true);
  });

  it('requires confirmation for multiple plans even when they are drafts', () => {
    expect(
      sessionRequiresDeleteConfirmation([
        createProject('project-a', []),
        createProject('project-b', []),
      ]),
    ).toBe(true);
  });
});

describe('projectRequiresDeleteConfirmation', () => {
  it('does not require confirmation for a draft plan', () => {
    expect(projectRequiresDeleteConfirmation(createProject('project-draft', []))).toBe(false);
  });

  it('requires confirmation when the plan has a configured target item', () => {
    expect(
      projectRequiresDeleteConfirmation(
        createProject('project-configured', [
          {
            id: 'target-a',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ]),
      ),
    ).toBe(true);
  });
});

function createProject(id: string, targets: PlannerProject['targets']): PlannerProject {
  return createPlannerProject({
    id,
    name: id,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets,
  });
}
