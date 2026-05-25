import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type PowerTarget,
  type ProductTarget,
} from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import { selectPlannerSolveInput } from './planner-solve-input';

const NOW = '2026-05-12T00:00:00.000Z';

describe('selectPlannerSolveInput', () => {
  it('keeps the solve key stable for display, layout, build state, and rename changes', () => {
    const project = createProject();
    const changedProject: PlannerProject = {
      ...project,
      name: 'Renamed factory',
      notes: 'Bring coupons\nCheck belt lifts',
      updatedAt: '2026-05-13T00:00:00.000Z',
      graphLayout: {
        nodePositions: {
          'recipe:Recipe_IronPlate_C': { x: 120, y: 240 },
        },
      },
      graphDisplay: {
        maxBeltTier: 3,
        maxPipeTier: 1,
        rateDecimalPlaces: 1,
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
      sinkRules: [
        {
          id: 'sink-screw',
          itemId: 'Desc_Screw_C',
          mode: 'surplus',
          sortOrder: 0,
        },
      ],
    };

    expect(solveKey(changedProject)).toBe(solveKey(project));
  });

  it('changes the solve key when solve-relevant project inputs change', () => {
    const project = createProject();
    const baseSolveKey = solveKey(project);
    const target = firstTarget(project);
    const changes: ReadonlyArray<{ name: string; project: PlannerProject }> = [
      {
        name: 'targets',
        project: {
          ...project,
          targets: [{ ...target, amountPerMinute: 20 }],
        },
      },
      {
        name: 'powerTargets',
        project: {
          ...project,
          powerTargets: [
            powerTarget({
              id: 'power-coal',
              generatorId: 'Build_GeneratorCoal_C',
              fuelItemId: 'Desc_Coal_C',
              generatorCount: 4,
            }),
          ],
        },
      },
      {
        name: 'recipeOverrides',
        project: {
          ...project,
          recipeOverrides: {
            ...project.recipeOverrides,
            Recipe_IronWire_C: { enabled: true },
          },
        },
      },
      {
        name: 'machineOverrides',
        project: {
          ...project,
          machineOverrides: {
            ...project.machineOverrides,
            Build_ConstructorMk1_C: { enabled: false },
          },
        },
      },
      {
        name: 'resourceOverrides',
        project: {
          ...project,
          resourceOverrides: {
            ...project.resourceOverrides,
            Desc_OreIron_C: { maxPerMinute: 120 },
          },
        },
      },
      {
        name: 'itemInputs',
        project: {
          ...project,
          itemInputs: {
            ...project.itemInputs,
            Desc_IngotIron_C: { amountPerMinute: 15 },
          },
        },
      },
      {
        name: 'objectiveProfile',
        project: {
          ...project,
          objectiveProfile: {
            ...project.objectiveProfile,
            powerWeight: 0.5,
          },
        },
      },
    ];

    for (const change of changes) {
      expect(solveKey(change.project), change.name).not.toBe(baseSolveKey);
    }
  });

  it('changes the solve key when power target solve fields change', () => {
    const project: PlannerProject = {
      ...createProject(),
      powerTargets: [
        powerTarget({
          id: 'power-coal',
          generatorId: 'Build_GeneratorCoal_C',
          fuelItemId: 'Desc_Coal_C',
          generatorCount: 4,
          sortOrder: 0,
        }),
        powerTarget({
          id: 'power-nuclear',
          generatorId: 'Build_GeneratorNuclear_C',
          fuelItemId: 'Desc_NuclearFuelRod_C',
          generatorCount: 2,
          sortOrder: 1,
        }),
      ],
    };
    const baseSolveKey = solveKey(project);
    const [coalTarget, nuclearTarget] = project.powerTargets;
    if (!coalTarget || !nuclearTarget) {
      throw new Error('Expected power targets');
    }
    const changes: ReadonlyArray<{ name: string; powerTargets: PowerTarget[] }> = [
      {
        name: 'remove',
        powerTargets: [coalTarget],
      },
      {
        name: 'reorder',
        powerTargets: [
          { ...nuclearTarget, sortOrder: 0 },
          { ...coalTarget, sortOrder: 1 },
        ],
      },
      {
        name: 'generator',
        powerTargets: [{ ...coalTarget, generatorId: 'Build_GeneratorFuel_C' }, nuclearTarget],
      },
      {
        name: 'fuel',
        powerTargets: [{ ...coalTarget, fuelItemId: 'Desc_CompactedCoal_C' }, nuclearTarget],
      },
      {
        name: 'generator-count amount',
        powerTargets: [{ ...coalTarget, generatorCount: 5 }, nuclearTarget],
      },
      {
        name: 'mode',
        powerTargets: [{ ...coalTarget, mode: 'power', powerMw: 300 }, nuclearTarget],
      },
      {
        name: 'power amount',
        powerTargets: [{ ...coalTarget, mode: 'power', powerMw: 450 }, nuclearTarget],
      },
    ];

    for (const change of changes) {
      expect(solveKey({ ...project, powerTargets: change.powerTargets }), change.name).not.toBe(
        baseSolveKey,
      );
    }
  });

  it('filters draft and zero fixed targets before building the solve key', () => {
    const project = createProject();
    const withDraftTargets: PlannerProject = {
      ...project,
      targets: [
        ...project.targets,
        {
          id: 'target-draft',
          itemId: '',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 1,
        },
        {
          id: 'target-zero',
          itemId: 'Desc_IronRod_C',
          mode: 'fixed',
          amountPerMinute: 0,
          sortOrder: 2,
        },
      ],
    };

    const input = selectPlannerSolveInput(withDraftTargets, tinySatisfactoryDataset);
    expect(input?.project.targets).toEqual(project.targets);
    expect(input?.key).toBe(solveKey(project));

    const draftOnlyProject = createPlannerProject({
      id: 'project-draft',
      name: 'Draft factory',
      dataset: tinySatisfactoryDataset,
      now: NOW,
      targets: [
        {
          id: 'target-draft',
          itemId: '',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ],
    });

    expect(
      selectPlannerSolveInput(draftOnlyProject, tinySatisfactoryDataset)?.project.targets,
    ).toEqual([]);
  });

  it('uses a stable JSON solve key instead of a short hash', () => {
    const key = solveKey(createProject());

    expect(key).toContain('"datasetKey":');
    expect(key).toContain('"recipeOverrides":');
    expect(key).not.toMatch(/^fnv1a32-[0-9a-f]{8}$/);
    expect(key.length).toBeGreaterThan(1_000);
  });

  it('changes the solve key when the dataset changes', () => {
    const project = createProject();
    const changedDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      generatedAt: '2026-05-13T00:00:00.000Z',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'changed-fixture',
      },
    };

    expect(solveKey(project, changedDataset)).not.toBe(solveKey(project));
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
    ],
  });
}

function solveKey(project: PlannerProject, dataset: GameDataset = tinySatisfactoryDataset): string {
  const input = selectPlannerSolveInput(project, dataset);
  if (!input) {
    throw new Error('Expected planner solve input');
  }
  return input.key;
}

function firstTarget(project: PlannerProject): ProductTarget {
  const target = project.targets[0];
  if (!target) {
    throw new Error('Expected a target');
  }
  return target;
}

function powerTarget(overrides: Partial<PowerTarget>): PowerTarget {
  return {
    id: 'power-target',
    mode: 'generator-count',
    generatorCount: 1,
    sortOrder: 0,
    ...overrides,
  };
}
