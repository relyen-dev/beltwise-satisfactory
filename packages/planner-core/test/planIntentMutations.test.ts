import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  cleanGraphNodeState,
  createPlannerProject,
  mutatePlanGraph,
  mutatePlanItemInputs,
  mutatePlanMetadata,
  mutatePlanObjective,
  mutatePlanOverrides,
  mutatePlanPowerTargets,
  mutatePlanSinkRules,
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

  it('reorders targets and normalizes sort order', () => {
    const project = createProject();

    const reordered = mutatePlanTargets(project, {
      type: 'reorder-targets',
      targetIds: ['target-b', 'missing-target', 'target-a', 'target-b'],
    });

    expect(reordered.targets.map((target) => [target.id, target.sortOrder])).toEqual([
      ['target-b', 0],
      ['target-a', 1],
    ]);
    expect(project.targets.map((target) => [target.id, target.sortOrder])).toEqual([
      ['target-a', 0],
      ['target-b', 1],
    ]);
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

  it('adds, updates, duplicates, reorders, and removes power targets', () => {
    const project = createProject();

    const withDraft = mutatePlanPowerTargets(project, {
      type: 'add-draft-power-target',
      powerTargetId: 'power-draft',
    });
    expect(withDraft.powerTargets).toEqual([
      {
        id: 'power-draft',
        mode: 'generator-count',
        generatorCount: 1,
        sortOrder: 0,
      },
    ]);

    const configured = mutatePlanPowerTargets(withDraft, {
      type: 'set-power-target-generator',
      powerTargetId: 'power-draft',
      generatorId: 'Build_GeneratorFuel_C',
    });
    const fueled = mutatePlanPowerTargets(configured, {
      type: 'set-power-target-fuel',
      powerTargetId: 'power-draft',
      fuelItemId: 'Desc_LiquidFuel_C',
    });
    const counted = mutatePlanPowerTargets(fueled, {
      type: 'set-power-target-generator-count',
      powerTargetId: 'power-draft',
      generatorCount: Number.NaN,
    });
    const powerMode = mutatePlanPowerTargets(counted, {
      type: 'set-power-target-mode',
      powerTargetId: 'power-draft',
      mode: 'power',
    });
    const powered = mutatePlanPowerTargets(powerMode, {
      type: 'set-power-target-power-mw',
      powerTargetId: 'power-draft',
      powerMw: 10_000,
    });
    const duplicated = mutatePlanPowerTargets(powered, {
      type: 'duplicate-power-target',
      powerTarget: powered.powerTargets[0]!,
      powerTargetId: 'power-copy',
    });
    const reordered = mutatePlanPowerTargets(duplicated, {
      type: 'reorder-power-targets',
      powerTargetIds: ['power-copy', 'missing-target', 'power-draft', 'power-copy'],
    });
    const removed = mutatePlanPowerTargets(reordered, {
      type: 'remove-power-target',
      powerTargetId: 'power-copy',
    });

    expect(counted.powerTargets[0]).toMatchObject({
      generatorId: 'Build_GeneratorFuel_C',
      fuelItemId: 'Desc_LiquidFuel_C',
      generatorCount: 0,
    });
    expect(powerMode.powerTargets[0]).toEqual({
      id: 'power-draft',
      mode: 'power',
      generatorId: 'Build_GeneratorFuel_C',
      fuelItemId: 'Desc_LiquidFuel_C',
      powerMw: 100,
      sortOrder: 0,
    });
    expect(powered.powerTargets[0]?.powerMw).toBe(10_000);
    expect(duplicated.powerTargets).toHaveLength(2);
    expect(reordered.powerTargets.map((target) => [target.id, target.sortOrder])).toEqual([
      ['power-copy', 0],
      ['power-draft', 1],
    ]);
    expect(removed.powerTargets).toEqual([
      {
        id: 'power-draft',
        mode: 'power',
        generatorId: 'Build_GeneratorFuel_C',
        fuelItemId: 'Desc_LiquidFuel_C',
        powerMw: 10_000,
        sortOrder: 0,
      },
    ]);
    expect(project.powerTargets).toEqual([]);
  });

  it('adds unique surplus sink rules and re-sorts after removal', () => {
    const project = createProject();

    const withScrewSink = mutatePlanSinkRules(project, {
      type: 'add-surplus-sink',
      sinkRuleId: 'sink-screw',
      itemId: 'Desc_Screw_C',
    });
    const unchangedDuplicate = mutatePlanSinkRules(withScrewSink, {
      type: 'add-surplus-sink',
      sinkRuleId: 'sink-screw-duplicate',
      itemId: 'Desc_Screw_C',
    });
    const withWireSink = mutatePlanSinkRules(unchangedDuplicate, {
      type: 'add-surplus-sink',
      sinkRuleId: 'sink-wire',
      itemId: 'Desc_Wire_C',
    });
    const withoutScrewSink = mutatePlanSinkRules(withWireSink, {
      type: 'remove-surplus-sink-for-item',
      itemId: 'Desc_Screw_C',
    });

    expect(withScrewSink.sinkRules).toEqual([
      {
        id: 'sink-screw',
        itemId: 'Desc_Screw_C',
        mode: 'surplus',
        sortOrder: 0,
      },
    ]);
    expect(unchangedDuplicate.sinkRules).toEqual(withScrewSink.sinkRules);
    expect(withWireSink.sinkRules.map((rule) => [rule.id, rule.sortOrder])).toEqual([
      ['sink-screw', 0],
      ['sink-wire', 1],
    ]);
    expect(withoutScrewSink.sinkRules).toEqual([
      {
        id: 'sink-wire',
        itemId: 'Desc_Wire_C',
        mode: 'surplus',
        sortOrder: 0,
      },
    ]);
    expect(project.sinkRules).toEqual([]);
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

  it('treats zero cap edits on unlimited resources as resetting the custom cap', () => {
    const project = createProject();
    const unlimitedCapPerMinute = Number.MAX_SAFE_INTEGER;

    const customWater = mutatePlanOverrides(project, {
      type: 'set-resource-cap',
      itemId: 'Desc_Water_C',
      maxPerMinute: 1,
      baselineCapPerMinute: unlimitedCapPerMinute,
    });
    expect(customWater.resourceOverrides['Desc_Water_C']).toEqual({ maxPerMinute: 1 });

    expect(
      mutatePlanOverrides(customWater, {
        type: 'set-resource-cap',
        itemId: 'Desc_Water_C',
        maxPerMinute: 0,
        baselineCapPerMinute: unlimitedCapPerMinute,
      }).resourceOverrides['Desc_Water_C'],
    ).toBeUndefined();

    expect(
      mutatePlanOverrides(project, {
        type: 'set-resource-cap',
        itemId: 'Desc_OreIron_C',
        maxPerMinute: 0,
        baselineCapPerMinute: 600,
      }).resourceOverrides['Desc_OreIron_C'],
    ).toEqual({ maxPerMinute: 0 });
  });

  it('marks raw resource multiplier edits as Custom and resets neutral values', () => {
    const project = createProject();

    const avoidedIron = mutatePlanObjective(project, {
      type: 'set-objective-raw-resource-multiplier',
      itemId: 'Desc_OreIron_C',
      value: 2.5,
    });
    expect(avoidedIron.objectiveProfile).toMatchObject({
      presetId: 'custom',
      rawResourceMultipliers: {
        Desc_OreIron_C: 2.5,
      },
    });

    const preferredCopper = mutatePlanObjective(avoidedIron, {
      type: 'set-objective-raw-resource-multiplier',
      itemId: 'Desc_OreCopper_C',
      value: 0.5,
    });
    expect(preferredCopper.objectiveProfile.rawResourceMultipliers).toEqual({
      Desc_OreIron_C: 2.5,
      Desc_OreCopper_C: 0.5,
    });

    const neutralIron = mutatePlanObjective(preferredCopper, {
      type: 'set-objective-raw-resource-multiplier',
      itemId: 'Desc_OreIron_C',
      value: 1,
    });
    expect(neutralIron.objectiveProfile.presetId).toBe('custom');
    expect(neutralIron.objectiveProfile.rawResourceMultipliers).toEqual({
      Desc_OreCopper_C: 0.5,
    });

    const resetCopper = mutatePlanObjective(neutralIron, {
      type: 'reset-objective-raw-resource-multiplier',
      itemId: 'Desc_OreCopper_C',
    });
    expect(resetCopper.objectiveProfile).toMatchObject({
      presetId: 'custom',
      rawResourceMultipliers: {},
    });
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

  it('restores graph node positions and removes entries missing at drag start', () => {
    const project: PlannerProject = {
      ...createProject(),
      graphLayout: {
        nodePositions: {
          'recipe:Recipe_IronPlate_C': { x: 120, y: 240 },
          'recipe:Recipe_IronRod_C': { x: 500, y: 600 },
        },
      },
    };

    const restored = mutatePlanGraph(project, {
      type: 'restore-node-positions',
      positions: {
        'recipe:Recipe_IronPlate_C': { x: 10, y: 20 },
        'recipe:Recipe_IronRod_C': null,
      },
    });

    expect(restored.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 10, y: 20 },
    });
    expect(project.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 120, y: 240 },
      'recipe:Recipe_IronRod_C': { x: 500, y: 600 },
    });
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
