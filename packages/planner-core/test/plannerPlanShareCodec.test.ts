import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  BELTWISE_PLAN_SHARE_KIND,
  createObjectiveProfileFromPreset,
  createPlannerProject,
  decodeBeltwisePlanShare,
  encodeBeltwisePlanShare,
  type BeltwisePlanSharePayload,
  type PlannerProject,
} from '@beltwise/planner-core';

describe('Beltwise compact plan share payloads', () => {
  it('encodes a canonical-default delta instead of user-default-dependent state', () => {
    const project = createSharedPlannerProject();

    const payload = encodeBeltwisePlanShare(project, tinySatisfactoryDataset);

    expect(payload).toEqual({
      k: BELTWISE_PLAN_SHARE_KIND,
      v: 1,
      d: {
        id: tinySatisfactoryDataset.id,
        gameVersionLabel: tinySatisfactoryDataset.gameVersionLabel,
        fingerprint: tinySatisfactoryDataset.source.fingerprint,
      },
      p: {
        n: 'Iron floor',
        no: 'Check belts\nBring power shards',
        t: [
          {
            id: 'target-fixed',
            i: 'Desc_IronPlate_C',
            m: 'f',
            a: 20,
            s: 0,
          },
          {
            id: 'target-maximize',
            i: 'Desc_Wire_C',
            m: 'x',
            s: 1,
          },
        ],
        sk: [
          {
            id: 'sink-screw',
            i: 'Desc_Screw_C',
            m: 's',
            s: 0,
          },
        ],
        r: [['Recipe_IronWire_C', true]],
        m: [['Build_ConstructorMk1_C', false]],
        rc: [{ i: 'Desc_OreIron_C', e: false, m: 120 }],
        i: [['Desc_IngotIron_C', 15]],
        o: {
          id: 'custom',
          rs: 2,
          p: 0.3,
          m: 0.4,
          s: 0.1,
          r: [['Desc_OreIron_C', 1.5]],
        },
        g: {
          b: 4,
          p: 1,
          d: 4,
          e: 'curved',
          l: false,
          a: false,
        },
        l: [['recipe:Recipe_IronPlate_C', 25, 50]],
        b: {
          p: true,
          l: true,
          n: [
            {
              id: 'recipe:Recipe_IronPlate_C',
              d: true,
              n: 'Floor 2',
            },
          ],
        },
      },
    });
    expect('userDefaults' in payload).toBe(false);
    expect('sessions' in payload).toBe(false);
    expect('activeSessionId' in payload).toBe(false);
    expect('sessionId' in payload.p).toBe(false);
  });

  it('decodes from canonical defaults and preserves plan intent, ids, layout, and notes', () => {
    const sourceProject = createSharedPlannerProject();
    const payload = encodeBeltwisePlanShare(sourceProject, tinySatisfactoryDataset);

    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.warnings).toEqual([]);
    expect(decoded.project).toMatchObject({
      id: 'project-imported',
      name: sourceProject.name,
      datasetId: tinySatisfactoryDataset.id,
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
      targets: sourceProject.targets,
      sinkRules: sourceProject.sinkRules,
      notes: sourceProject.notes,
      recipeOverrides: sourceProject.recipeOverrides,
      machineOverrides: sourceProject.machineOverrides,
      resourceOverrides: sourceProject.resourceOverrides,
      itemInputs: sourceProject.itemInputs,
      objectiveProfile: sourceProject.objectiveProfile,
      graphLayout: sourceProject.graphLayout,
      graphDisplay: sourceProject.graphDisplay,
      buildState: sourceProject.buildState,
    });
  });

  it('round-trips compact objective preset strategy and stage order', () => {
    const sourceProject = {
      ...createSharedPlannerProject(),
      objectiveProfile: createObjectiveProfileFromPreset('low-surplus', {
        rawResourceMultipliers: {
          Desc_OreIron_C: 1.25,
        },
      }),
    };
    const payload = encodeBeltwisePlanShare(sourceProject, tinySatisfactoryDataset);

    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(payload.p.o).toMatchObject({
      id: 'low-surplus',
      g: ['s', 'r', 'm', 'p'],
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.objectiveProfile).toEqual(sourceProject.objectiveProfile);
  });

  it('fails cleanly for malformed payloads and future versions', () => {
    expect(decodeBeltwisePlanShare(null, tinySatisfactoryDataset)).toMatchObject({
      ok: false,
      error: { code: 'invalid-envelope' },
    });
    expect(
      decodeBeltwisePlanShare({ k: 'beltwise.plan', v: 1 }, tinySatisfactoryDataset),
    ).toMatchObject({
      ok: false,
      error: { code: 'wrong-kind' },
    });
    expect(
      decodeBeltwisePlanShare(
        { ...encodeBeltwisePlanShare(createSharedPlannerProject(), tinySatisfactoryDataset), v: 2 },
        tinySatisfactoryDataset,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
    expect(
      decodeBeltwisePlanShare(
        {
          ...encodeBeltwisePlanShare(createSharedPlannerProject(), tinySatisfactoryDataset),
          p: {},
        },
        tinySatisfactoryDataset,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-project' },
    });
  });

  it('warns but imports when the shared dataset metadata differs', () => {
    const payload = encodeBeltwisePlanShare(createSharedPlannerProject(), tinySatisfactoryDataset);
    const currentDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      id: 'satisfactory-current',
      gameVersionLabel: '1.1',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'current-fingerprint',
      },
    };

    const decoded = decodeBeltwisePlanShare(payload, currentDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.name).toBe('Iron floor');
    expect(decoded.warnings).toEqual([
      {
        code: 'dataset-mismatch',
        exportedDatasetId: tinySatisfactoryDataset.id,
        currentDatasetId: 'satisfactory-current',
        message:
          'This plan was shared with dataset satisfactory-tiny-fixture (fixture) and was ' +
          'imported with the current dataset satisfactory-current (1.1).',
      },
    ]);
  });

  it('keeps default-only plans tiny by omitting canonical default settings', () => {
    const project = createPlannerProject({
      id: 'project-default',
      name: 'Default plan',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    const payload = encodeBeltwisePlanShare(project, tinySatisfactoryDataset);
    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(payload.p).toEqual({ n: 'Default plan' });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.recipeOverrides).toEqual(project.recipeOverrides);
    expect(decoded.project.objectiveProfile).toEqual(project.objectiveProfile);
    expect(decoded.project.graphDisplay).toEqual(project.graphDisplay);
  });

  it('omits no-op resource overrides so encoded plans still round-trip', () => {
    const project: PlannerProject = {
      ...createPlannerProject({
        id: 'project-noop-resource',
        name: 'No-op resource',
        dataset: tinySatisfactoryDataset,
        now: '2026-05-12T00:00:00.000Z',
      }),
      resourceOverrides: {
        Desc_OreIron_C: { enabled: true },
      },
    };

    const payload = encodeBeltwisePlanShare(project, tinySatisfactoryDataset);
    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(payload.p.rc).toBeUndefined();
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.resourceOverrides).toEqual({});
  });

  it('rejects negative solve-bound numeric values in compact payloads', () => {
    const payload = encodeBeltwisePlanShare(createSharedPlannerProject(), tinySatisfactoryDataset);

    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        t: [{ id: 'target-negative', i: 'Desc_IronPlate_C', m: 'f', a: -1, s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        i: [['Desc_IngotIron_C', -10]],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        rc: [{ i: 'Desc_OreIron_C', m: -10 }],
      },
    });
  });

  it('rejects unsafe compact target ids and item ids', () => {
    const payload = encodeBeltwisePlanShare(createSharedPlannerProject(), tinySatisfactoryDataset);

    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        t: [{ id: '__proto__', i: 'Desc_IronPlate_C', m: 'f', a: 10, s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        t: [{ id: 'target-safe', i: '__proto__', m: 'f', a: 10, s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        t: [{ id: 'toString', i: 'Desc_IronPlate_C', m: 'f', a: 10, s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        t: [{ id: 'target-safe', i: 'hasOwnProperty', m: 'f', a: 10, s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        sk: [{ id: 'sink-safe', i: '__proto__', m: 's', s: 0 }],
      },
    });
    expectInvalidProjectPayload({
      ...payload,
      p: {
        ...payload.p,
        sk: [{ id: 'toString', i: 'Desc_Screw_C', m: 's', s: 0 }],
      },
    });
  });

  it('imports script-looking notes and names as inert plain text', () => {
    const attackText =
      '<img src=x onerror="globalThis.__beltwiseXss = true"><script>alert(1)</script>';
    const payload: BeltwisePlanSharePayload = {
      k: BELTWISE_PLAN_SHARE_KIND,
      v: 1,
      d: {
        id: tinySatisfactoryDataset.id,
        gameVersionLabel: tinySatisfactoryDataset.gameVersionLabel,
      },
      p: {
        n: attackText,
        no: attackText,
        b: {
          n: [{ id: 'recipe:Recipe_IronPlate_C', n: attackText }],
        },
      },
    };

    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.name).toBe(attackText);
    expect(decoded.project.notes).toBe(attackText);
    expect(decoded.project.buildState.nodeStates['recipe:Recipe_IronPlate_C']).toEqual({
      note: attackText,
    });
    expect(globalThis).not.toHaveProperty('__beltwiseXss');
  });

  it('drops unsafe compact record ids instead of importing polluted maps', () => {
    const payload: BeltwisePlanSharePayload = {
      k: BELTWISE_PLAN_SHARE_KIND,
      v: 1,
      d: {
        id: tinySatisfactoryDataset.id,
        gameVersionLabel: tinySatisfactoryDataset.gameVersionLabel,
      },
      p: {
        n: 'Polluted plan',
        r: [['__proto__', false]],
        m: [['toString', false]],
        rc: [
          { i: 'prototype', e: false },
          { i: 'hasOwnProperty', e: false },
        ],
        i: [
          ['__proto__', 10],
          ['toString', 10],
        ],
        o: {
          r: [
            ['constructor', 2],
            ['hasOwnProperty', 2],
          ],
        },
        l: [
          ['__proto__', 10, 20],
          ['toString', 30, 40],
        ],
        b: {
          n: [
            { id: '__proto__', d: true, n: 'polluted' },
            { id: 'hasOwnProperty', d: true, n: 'polluted' },
          ],
        },
      },
    };

    const decoded = decodeBeltwisePlanShare(payload, tinySatisfactoryDataset, {
      id: 'project-imported',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(Object.prototype.hasOwnProperty.call(decoded.project.recipeOverrides, '__proto__')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(decoded.project.machineOverrides, 'toString')).toBe(
      false,
    );
    expect(decoded.project.resourceOverrides).toEqual({});
    expect(decoded.project.itemInputs).toEqual({});
    expect(decoded.project.objectiveProfile.rawResourceMultipliers).toEqual({});
    expect(decoded.project.graphLayout.nodePositions).toEqual({});
    expect(decoded.project.buildState.nodeStates).toEqual({});
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

function expectInvalidProjectPayload(payload: BeltwisePlanSharePayload): void {
  expect(decodeBeltwisePlanShare(payload, tinySatisfactoryDataset)).toMatchObject({
    ok: false,
    error: { code: 'invalid-project' },
  });
}

function createSharedPlannerProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-share',
      name: 'Iron floor',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    }),
    notes: 'Check belts\nBring power shards',
    targets: [
      {
        id: 'target-fixed',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 0,
      },
      {
        id: 'target-maximize',
        itemId: 'Desc_Wire_C',
        mode: 'maximize',
        sortOrder: 1,
      },
    ],
    sinkRules: [
      {
        id: 'sink-screw',
        itemId: 'Desc_Screw_C',
        mode: 'surplus',
        sortOrder: 0,
      },
    ],
    recipeOverrides: {
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { enabled: false, maxPerMinute: 120 },
    },
    itemInputs: {
      Desc_IngotIron_C: { amountPerMinute: 15 },
    },
    objectiveProfile: {
      presetId: 'custom',
      strategy: 'lexicographic',
      stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
      resourceScarcityWeight: 2,
      powerWeight: 0.3,
      machineCountWeight: 0.4,
      surplusWeight: 0.1,
      rawResourceMultipliers: {
        Desc_OreIron_C: 1.5,
      },
    },
    graphLayout: {
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 25, y: 50 },
      },
    },
    graphDisplay: {
      maxBeltTier: 4,
      maxPipeTier: 1,
      rateDecimalPlaces: 4,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: false,
    },
    buildState: {
      planLocked: true,
      nodeLayoutLocked: true,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': {
          done: true,
          note: 'Floor 2',
        },
      },
    },
  };
}
