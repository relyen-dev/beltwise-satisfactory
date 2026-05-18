import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import {
  addDraftTarget,
  cleanGraphNodeState,
  moveItemInput,
  removeTarget,
  setGraphNodeDone,
  setGraphNodeNote,
  setPlanNotes,
  setResourceCap,
  setResourceEnabled,
  setTargetAmount,
  setTargetMode,
} from './planner-project-mutations';

const NOW = '2026-05-12T00:00:00.000Z';

describe('planner project mutations', () => {
  it('adds draft targets and re-sorts targets after removal', () => {
    const project = createProject();

    const withDraft = addDraftTarget(project, 'target-draft');
    expect(withDraft.targets).toHaveLength(3);
    expect(withDraft.targets[2]).toEqual({
      id: 'target-draft',
      itemId: '',
      mode: 'fixed',
      amountPerMinute: 10,
      sortOrder: 2,
    });

    const withoutFirst = removeTarget(withDraft, 'target-a');
    expect(withoutFirst.targets.map((target) => [target.id, target.sortOrder])).toEqual([
      ['target-b', 0],
      ['target-draft', 1],
    ]);
    expect(project.targets.map((target) => target.id)).toEqual(['target-a', 'target-b']);
  });

  it('preserves target mode defaults and sanitizes fixed amounts', () => {
    const project = createProject();

    const maximizeProject = setTargetMode(project, 'target-a', 'maximize');
    expect(maximizeProject.targets[0]).not.toHaveProperty('amountPerMinute');

    const fixedProject = setTargetMode(maximizeProject, 'target-a', 'fixed');
    expect(fixedProject.targets[0]?.amountPerMinute).toBe(10);

    expect(setTargetAmount(project, 'target-a', Number.NaN).targets[0]?.amountPerMinute).toBe(0);
    expect(setTargetAmount(project, 'target-a', -5).targets[0]?.amountPerMinute).toBe(0);
  });

  it('merges external input amounts when changing to an existing item', () => {
    const project: PlannerProject = {
      ...createProject(),
      itemInputs: {
        Desc_IngotIron_C: { amountPerMinute: 5 },
        Desc_IronPlate_C: { amountPerMinute: 8 },
      },
    };

    const moved = moveItemInput(project, 'Desc_IngotIron_C', 'Desc_IronPlate_C');

    expect(moved.itemInputs).toEqual({
      Desc_IronPlate_C: { amountPerMinute: 13 },
    });
    expect(project.itemInputs['Desc_IngotIron_C']).toEqual({ amountPerMinute: 5 });
  });

  it('normalizes resource overrides against the dataset baseline', () => {
    const project = createProject();

    const baselineCapPerMinute = 600;
    expect(
      setResourceCap(project, 'Desc_OreIron_C', baselineCapPerMinute, baselineCapPerMinute)
        .resourceOverrides,
    ).toEqual({});

    const disabled = setResourceEnabled(project, 'Desc_OreIron_C', false, baselineCapPerMinute);
    expect(disabled.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: baselineCapPerMinute,
    });

    const disabledCustomCap = setResourceCap(
      disabled,
      'Desc_OreIron_C',
      120,
      baselineCapPerMinute,
    );
    expect(disabledCustomCap.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: 120,
    });

    expect(
      setResourceEnabled(disabled, 'Desc_OreIron_C', true, baselineCapPerMinute).resourceOverrides,
    ).toEqual({});
  });

  it('removes empty graph node build state after done and note updates', () => {
    const project: PlannerProject = {
      ...createProject(),
      buildState: {
        planLocked: false,
        nodeLayoutLocked: false,
        nodeStates: {
          'recipe:Recipe_IronPlate_C': {
            done: true,
            note: 'Floor 2',
          },
        },
      },
    };

    const noteOnly = setGraphNodeDone(project, 'recipe:Recipe_IronPlate_C', false);
    expect(noteOnly.buildState.nodeStates['recipe:Recipe_IronPlate_C']).toEqual({
      note: 'Floor 2',
    });

    const cleared = setGraphNodeNote(noteOnly, 'recipe:Recipe_IronPlate_C', '   ');
    expect(cleared.buildState.nodeStates).toEqual({});
    expect(cleanGraphNodeState({ done: false, note: '' })).toBeNull();
  });

  it('sets and clears plain-text plan notes without touching solver configuration', () => {
    const project = createProject();

    const noted = setPlanNotes(project, 'Check belts\nBring power shards');
    const cleared = setPlanNotes(noted, '  \n  ');

    expect(noted.notes).toBe('Check belts\nBring power shards');
    expect(noted.targets).toBe(project.targets);
    expect(cleared.notes).toBe('');
  });
});

function createProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: 'target-a',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
      {
        id: 'target-b',
        itemId: 'Desc_IronRod_C',
        mode: 'fixed',
        amountPerMinute: 5,
        sortOrder: 1,
      },
    ],
  });
}
