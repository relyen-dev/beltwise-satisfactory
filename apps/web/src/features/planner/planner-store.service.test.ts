import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductTarget,
} from '@beltwise/planner-core';
import { selectPlannerSolveInput, type PlannerSolveKey } from './planner-solve-input';
import { PlannerSolveScheduler } from './planner-store.service';

const NOW = '2026-05-12T00:00:00.000Z';

describe('selectPlannerSolveInput', () => {
  it('keeps the solve key stable for display, layout, build state, and rename changes', () => {
    const project = createProject();
    const changedProject: PlannerProject = {
      ...project,
      name: 'Renamed factory',
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

describe('PlannerSolveScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid solve inputs into the latest scheduled solve', () => {
    vi.useFakeTimers();
    const scheduler = new PlannerSolveScheduler<PlannerSolveKey>(50);
    const solvedKeys: PlannerSolveKey[] = [];

    scheduler.schedule('first', (key) => solvedKeys.push(key));
    scheduler.schedule('second', (key) => solvedKeys.push(key));
    scheduler.schedule('third', (key) => solvedKeys.push(key));

    vi.advanceTimersByTime(49);
    expect(solvedKeys).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(solvedKeys).toEqual(['third']);
  });

  it('can cancel a pending solve before the debounce delay completes', () => {
    vi.useFakeTimers();
    const scheduler = new PlannerSolveScheduler<PlannerSolveKey>(50);
    const solvedKeys: PlannerSolveKey[] = [];

    scheduler.schedule('pending', (key) => solvedKeys.push(key));
    scheduler.cancel();
    vi.advanceTimersByTime(50);

    expect(solvedKeys).toEqual([]);
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
