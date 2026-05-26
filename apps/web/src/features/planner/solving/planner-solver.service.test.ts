import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type PowerTarget,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { type ProductionPlanInput } from '@beltwise/solver';
import { ApplicationUpdateRequiredError } from '../../../app/application-update-notice.service';
import { selectPlannerSolveInput, type PlannerSolveInput } from './planner-solve-input';
import { PlannerProductionSolverService } from './planner-production-solver.service';
import {
  PLANNER_SOLVE_DEBOUNCE_MS,
  PlannerSolveScheduler,
  PlannerSolverService,
} from './planner-solver.service';

const NOW = '2026-05-12T00:00:00.000Z';

describe('PlannerSolveScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid solve inputs into the latest scheduled solve', () => {
    vi.useFakeTimers();
    const scheduler = new PlannerSolveScheduler<string>(50);
    const solvedKeys: string[] = [];

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
    const scheduler = new PlannerSolveScheduler<string>(50);
    const solvedKeys: string[] = [];

    scheduler.schedule('pending', (key) => solvedKeys.push(key));
    scheduler.cancel();
    vi.advanceTimersByTime(50);

    expect(solvedKeys).toEqual([]);
  });
});

describe('PlannerSolverService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty solved result without calling the solver for projects without solve targets', () => {
    const { service, solveCalls } = createSolverHarness();

    service.requestSolve(createSolveInput(createProject([])));

    expect(solveCalls).toEqual([]);
    expect(service.solveStatus()).toBe('solved');
    expect(service.solveError()).toBeNull();
    expect(service.solveResult()).toMatchObject({
      status: 'optimal',
      recipeRates: {},
      outputs: {},
    });
  });

  it('sends productless projects with inactive power targets to the solver for validation', async () => {
    vi.useFakeTimers();
    const dataset = withPowerDataset();
    const { service, solveCalls } = createSolverHarness();

    service.requestSolve(
      createSolveInput(
        createProject([], dataset, [
          {
            id: 'power-draft',
            mode: 'generator-count',
            generatorCount: 1,
            sortOrder: 0,
          },
          {
            id: 'power-zero',
            mode: 'generator-count',
            generatorId: 'Build_GeneratorCoal_C',
            fuelItemId: 'Desc_Coal_C',
            generatorCount: 0,
            sortOrder: 1,
          },
        ]),
        dataset,
      ),
    );

    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(solveCalls).toHaveLength(1);
    expect(service.solveStatus()).toBe('solved');
    expect(service.solveResult()).toMatchObject({
      status: 'optimal',
      recipeRates: {},
      outputs: {},
    });
  });

  it('preserves warnings from invalid productless power targets', async () => {
    vi.useFakeTimers();
    const dataset = withPowerDataset();
    const warning = {
      code: 'power-target-invalid-option',
      message: 'Invalid generator/fuel option.',
      powerTargetId: 'power-invalid',
      itemId: 'Desc_Water_C',
    };
    const { service, solveCalls } = createSolverHarness({
      solve: () => Promise.resolve(createResult({ warnings: [warning] })),
    });

    service.requestSolve(
      createSolveInput(
        createProject([], dataset, [
          {
            id: 'power-invalid',
            mode: 'generator-count',
            generatorId: 'Build_GeneratorCoal_C',
            fuelItemId: 'Desc_Water_C',
            generatorCount: 4,
            sortOrder: 0,
          },
        ]),
        dataset,
      ),
    );

    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(solveCalls).toHaveLength(1);
    expect(service.solveStatus()).toBe('solved');
    expect(service.solveResult()?.warnings).toEqual([warning]);
  });

  it('sends productless projects with active power targets to the solver', async () => {
    vi.useFakeTimers();
    const dataset = withPowerDataset();
    const { service, solveCalls } = createSolverHarness();

    service.requestSolve(
      createSolveInput(
        createProject([], dataset, [
          {
            id: 'power-coal',
            mode: 'generator-count',
            generatorId: 'Build_GeneratorCoal_C',
            fuelItemId: 'Desc_Coal_C',
            generatorCount: 4,
            sortOrder: 0,
          },
        ]),
        dataset,
      ),
    );

    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(solveCalls).toHaveLength(1);
    expect(solveCalls[0]?.project.targets).toEqual([]);
    expect(solveCalls[0]?.project.powerTargets).toMatchObject([
      {
        id: 'power-coal',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_Coal_C',
        generatorCount: 4,
      },
    ]);
    expect(service.solveStatus()).toBe('solved');
  });

  it('debounces solve requests and sends the latest input to the solver', async () => {
    vi.useFakeTimers();
    const { service, solveCalls } = createSolverHarness();
    const first = createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }]));
    const second = createSolveInput(createProject([{ itemId: 'Desc_Wire_C' }]));

    service.requestSolve(first);
    service.requestSolve(second);

    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS - 1);
    expect(solveCalls).toEqual([]);

    vi.advanceTimersByTime(1);
    await flushPromises();

    expect(solveCalls).toHaveLength(1);
    expect(solveCalls[0]?.project.targets[0]?.itemId).toBe('Desc_Wire_C');
    expect(service.solveStatus()).toBe('solved');

    service.requestSolve(first);
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(solveCalls).toHaveLength(2);
    expect(solveCalls[1]?.project.targets[0]?.itemId).toBe('Desc_IronPlate_C');
  });

  it('ignores stale solve results after a newer solve has been requested', async () => {
    vi.useFakeTimers();
    const firstSolve = createDeferred<ProductionPlanResult>();
    const secondSolve = createDeferred<ProductionPlanResult>();
    const pendingSolves = [firstSolve, secondSolve];
    const solve: PlannerSolveFunction = () => {
      const pendingSolve = pendingSolves.shift();
      if (!pendingSolve) {
        throw new Error('Unexpected solve request');
      }
      return pendingSolve.promise;
    };
    const { service } = createSolverHarness({ solve });

    service.requestSolve(createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }])));
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    service.requestSolve(createSolveInput(createProject([{ itemId: 'Desc_Wire_C' }])));
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);

    secondSolve.resolve(createResult({ powerMw: 2 }));
    await flushPromises();
    expect(service.solveResult()?.powerMw).toBe(2);
    expect(service.solveStatus()).toBe('solved');

    firstSolve.resolve(createResult({ powerMw: 1 }));
    await flushPromises();
    expect(service.solveResult()?.powerMw).toBe(2);
  });

  it('captures solver failures on the current request', async () => {
    vi.useFakeTimers();
    const solve: PlannerSolveFunction = () => Promise.reject(new Error('LP failed'));
    const { service } = createSolverHarness({ solve });

    service.requestSolve(createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }])));
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(service.solveStatus()).toBe('error');
    expect(service.solveError()).toBe('LP failed');
    expect(service.solveResult()).toBeNull();
  });

  it('suppresses stale application update failures after the notice is shown', async () => {
    vi.useFakeTimers();
    const solve: PlannerSolveFunction = () =>
      Promise.reject(
        new ApplicationUpdateRequiredError(
          new TypeError('Failed to fetch dynamically imported module: /chunk-SOLVER.js'),
        ),
      );
    const { service } = createSolverHarness({ solve });

    service.requestSolve(createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }])));
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(service.solveStatus()).toBe('idle');
    expect(service.solveError()).toBeNull();
    expect(service.solveResult()).toBeNull();
  });
});

function createSolverHarness(
  options: {
    solve?: PlannerSolveFunction;
  } = {},
): {
  service: PlannerSolverService;
  solveCalls: ProductionPlanInput[];
} {
  const solveCalls: ProductionPlanInput[] = [];
  const solve: PlannerSolveFunction =
    options.solve ??
    ((input) => {
      solveCalls.push(input);
      return Promise.resolve(createResult());
    });
  const productionSolver: Pick<PlannerProductionSolverService, 'solve'> = {
    solve: (input) => {
      if (options.solve) {
        solveCalls.push(input);
      }
      return solve(input);
    },
  };
  const injector = Injector.create({
    providers: [
      PlannerSolverService,
      { provide: PlannerProductionSolverService, useValue: productionSolver },
    ],
  });

  return {
    service: injector.get(PlannerSolverService),
    solveCalls,
  };
}

function createProject(
  targets: ReadonlyArray<{ itemId: string }>,
  dataset: GameDataset = tinySatisfactoryDataset,
  powerTargets: PowerTarget[] = [],
): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset,
    now: NOW,
    powerTargets,
    targets: targets.map((target, index) => ({
      id: `target-${index}`,
      itemId: target.itemId,
      mode: 'fixed',
      amountPerMinute: 10,
      sortOrder: index,
    })),
  });
}

function createSolveInput(
  project: PlannerProject,
  dataset: GameDataset = tinySatisfactoryDataset,
): PlannerSolveInput {
  const input = selectPlannerSolveInput(project, dataset);
  if (!input) {
    throw new Error('Expected planner solve input');
  }
  return input;
}

function createResult(overrides: Partial<ProductionPlanResult> = {}): ProductionPlanResult {
  return {
    status: 'optimal',
    recipeRates: {},
    rawInputs: {},
    externalInputs: {},
    itemFlows: [],
    outputs: {},
    surplus: {},
    machineUsage: [],
    powerMw: 0,
    warnings: [],
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

type PlannerSolveFunction = (input: ProductionPlanInput) => Promise<ProductionPlanResult>;

function withPowerDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Coal_C: {
        id: 'Desc_Coal_C',
        className: 'Desc_Coal_C',
        displayName: 'Coal',
        form: 'solid',
      },
      Desc_Water_C: {
        id: 'Desc_Water_C',
        className: 'Desc_Water_C',
        displayName: 'Water',
        form: 'liquid',
      },
    },
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_GeneratorCoal_C: {
        id: 'Build_GeneratorCoal_C',
        className: 'Build_GeneratorCoal_C',
        displayName: 'Coal Generator',
        type: 'generator',
        powerMw: 75,
      },
    },
    generatorFuelOptions: {
      'Build_GeneratorCoal_C:Desc_Coal_C': {
        id: 'Build_GeneratorCoal_C:Desc_Coal_C',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_Coal_C',
        powerMw: 75,
        fuelConsumedPerMinute: 15,
        supplementalInputs: [{ itemId: 'Desc_Water_C', amountPerMinute: 45 }],
        byproducts: [],
      },
    },
  };
}
