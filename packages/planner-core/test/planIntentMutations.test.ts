import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  cleanGraphNodeState,
  createPlannerProject,
  mutatePlanGraph,
  mutatePlanItemInputs,
  mutatePlanMetadata,
  mutatePlanOverrides,
  mutatePlanTargets,
  type PlannerProject,
} from '@beltwise/planner-core';

const NOW = '2026-05-12T00:00:00.000Z';

describe('plan intent mutations', () => {
  it('adds draft targets and re-sorts targets after removal', () => {
    const project = createProject();

    const withDraft = mutatePlanTargets(project, {
      type: 'add-draft-target',
      targetId: 'target-draft',
    });
    expect(withDraft.targets).toHaveLength(3);
    expect(withDraft.targets[2]).toEqual({
      id: 'target-draft',
      itemId: '',
      mode: 'fixed',
      amountPerMinute: 10,
      sortOrder: 2,
    });

    const withoutFirst = mutatePlanTargets(withDraft, {
      type: 'remove-target',
      targetId: 'target-a',
    });
    expect(withoutFirst.targets.map((target) => [target.id, target.sortOrder])).toEqual([
      ['target-b', 0],
      ['target-draft', 1],
    ]);
    expect(project.targets.map((target) => target.id)).toEqual(['target-a', 'target-b']);
  });

  it('preserves target mode defaults and sanitizes fixed amounts', () => {
    const project = createProject();

    const maximizeProject = mutatePlanTargets(project, {
      type: 'set-target-mode',
      targetId: 'target-a',
      mode: 'maximize',
    });
    expect(maximizeProject.targets[0]).not.toHaveProperty('amountPerMinute');

    const fixedProject = mutatePlanTargets(maximizeProject, {
      type: 'set-target-mode',
      targetId: 'target-a',
      mode: 'fixed',
    });
    expect(fixedProject.targets[0]?.amountPerMinute).toBe(10);

    expect(
      mutatePlanTargets(project, {
        type: 'set-target-amount',
        targetId: 'target-a',
        amountPerMinute: Number.NaN,
      }).targets[0]?.amountPerMinute,
    ).toBe(0);
    expect(
      mutatePlanTargets(project, {
        type: 'set-target-amount',
        targetId: 'target-a',
        amountPerMinute: -5,
      }).targets[0]?.amountPerMinute,
    ).toBe(0);
  });

  it('merges external input amounts when changing to an existing item', () => {
    const project: PlannerProject = {
      ...createProject(),
      itemInputs: {
        Desc_IngotIron_C: { amountPerMinute: 5 },
        Desc_IronPlate_C: { amountPerMinute: 8 },
      },
    };

    const moved = mutatePlanItemInputs(project, {
      type: 'move-item-input',
      previousItemId: 'Desc_IngotIron_C',
      nextItemId: 'Desc_IronPlate_C',
    });

    expect(moved.itemInputs).toEqual({
      Desc_IronPlate_C: { amountPerMinute: 13 },
    });
    expect(project.itemInputs['Desc_IngotIron_C']).toEqual({ amountPerMinute: 5 });
  });

  it('normalizes resource overrides against the dataset baseline', () => {
    const project = createProject();

    const baselineCapPerMinute = 600;
    expect(
      mutatePlanOverrides(project, {
        type: 'set-resource-cap',
        itemId: 'Desc_OreIron_C',
        maxPerMinute: baselineCapPerMinute,
        baselineCapPerMinute,
      }).resourceOverrides,
    ).toEqual({});

    const disabled = mutatePlanOverrides(project, {
      type: 'set-resource-enabled',
      itemId: 'Desc_OreIron_C',
      enabled: false,
      baselineCapPerMinute,
    });
    expect(disabled.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: baselineCapPerMinute,
    });

    const disabledCustomCap = mutatePlanOverrides(disabled, {
      type: 'set-resource-cap',
      itemId: 'Desc_OreIron_C',
      maxPerMinute: 120,
      baselineCapPerMinute,
    });
    expect(disabledCustomCap.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: 120,
    });

    expect(
      mutatePlanOverrides(disabled, {
        type: 'set-resource-enabled',
        itemId: 'Desc_OreIron_C',
        enabled: true,
        baselineCapPerMinute,
      }).resourceOverrides,
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

    const noteOnly = mutatePlanGraph(project, {
      type: 'set-node-done',
      nodeId: 'recipe:Recipe_IronPlate_C',
      done: false,
    });
    expect(noteOnly.buildState.nodeStates['recipe:Recipe_IronPlate_C']).toEqual({
      note: 'Floor 2',
    });

    const cleared = mutatePlanGraph(noteOnly, {
      type: 'set-node-note',
      nodeId: 'recipe:Recipe_IronPlate_C',
      note: '   ',
    });
    expect(cleared.buildState.nodeStates).toEqual({});
    expect(cleanGraphNodeState({ done: false, note: '' })).toBeNull();
  });

  it('sets and clears plain-text plan notes without touching solver configuration', () => {
    const project = createProject();

    const noted = mutatePlanMetadata(project, {
      type: 'set-notes',
      notes: 'Check belts\nBring power shards',
    });
    const cleared = mutatePlanMetadata(noted, { type: 'set-notes', notes: '  \n  ' });

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
