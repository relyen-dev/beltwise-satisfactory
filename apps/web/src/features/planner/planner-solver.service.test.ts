import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { type ProductionSolverAdapter } from '@beltwise/solver';
import { selectPlannerSolveInput, type PlannerSolveInput } from './planner-solve-input';
import {
  PLANNER_SOLVE_DEBOUNCE_MS,
  PLANNER_SOLVE_RUNNER,
  PLANNER_SOLVER_ADAPTER_FACTORY,
  PlannerSolveScheduler,
  PlannerSolverService,
  type PlannerSolveRunner,
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

  it('returns an empty solved result without calling the solver for projects without targets', () => {
    const { runnerCalls, service } = createSolverHarness();

    service.requestSolve(createSolveInput(createProject([])));

    expect(runnerCalls).toEqual([]);
    expect(service.solveStatus()).toBe('solved');
    expect(service.solveError()).toBeNull();
    expect(service.solveResult()).toMatchObject({
      status: 'optimal',
      recipeRates: {},
      outputs: {},
    });
  });

  it('debounces solve requests and reuses one solver adapter instance', async () => {
    vi.useFakeTimers();
    const { adapters, runnerCalls, service } = createSolverHarness();
    const first = createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }]));
    const second = createSolveInput(createProject([{ itemId: 'Desc_Wire_C' }]));

    service.requestSolve(first);
    service.requestSolve(second);

    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS - 1);
    expect(runnerCalls).toEqual([]);

    vi.advanceTimersByTime(1);
    await flushPromises();

    expect(runnerCalls).toHaveLength(1);
    expect(runnerCalls[0]?.input.project.targets[0]?.itemId).toBe('Desc_Wire_C');
    expect(adapters).toHaveLength(1);
    expect(runnerCalls[0]?.adapter).toBe(adapters[0]);
    expect(service.solveStatus()).toBe('solved');

    service.requestSolve(first);
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(runnerCalls).toHaveLength(2);
    expect(adapters).toHaveLength(1);
    expect(runnerCalls[1]?.adapter).toBe(adapters[0]);
  });

  it('ignores stale solve results after a newer solve has been requested', async () => {
    vi.useFakeTimers();
    const firstSolve = createDeferred<ProductionPlanResult>();
    const secondSolve = createDeferred<ProductionPlanResult>();
    const pendingSolves = [firstSolve, secondSolve];
    const runner: PlannerSolveRunner = () => {
      const pendingSolve = pendingSolves.shift();
      if (!pendingSolve) {
        throw new Error('Unexpected solve request');
      }
      return pendingSolve.promise;
    };
    const { service } = createSolverHarness({ runner });

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
    const runner: PlannerSolveRunner = () => Promise.reject(new Error('LP failed'));
    const { service } = createSolverHarness({ runner });

    service.requestSolve(createSolveInput(createProject([{ itemId: 'Desc_IronPlate_C' }])));
    vi.advanceTimersByTime(PLANNER_SOLVE_DEBOUNCE_MS);
    await flushPromises();

    expect(service.solveStatus()).toBe('error');
    expect(service.solveError()).toBe('LP failed');
    expect(service.solveResult()).toBeNull();
  });
});

function createSolverHarness(
  options: {
    runner?: PlannerSolveRunner;
  } = {},
): {
  adapters: ProductionSolverAdapter[];
  runnerCalls: RunnerCall[];
  service: PlannerSolverService;
} {
  const adapters: ProductionSolverAdapter[] = [];
  const runnerCalls: RunnerCall[] = [];
  const runner: PlannerSolveRunner =
    options.runner ??
    ((input, adapter) => {
      runnerCalls.push({ input, adapter });
      return Promise.resolve(createResult());
    });
  const adapterFactory = (): ProductionSolverAdapter => {
    const adapter = createAdapter(`adapter-${adapters.length + 1}`);
    adapters.push(adapter);
    return adapter;
  };
  const injector = Injector.create({
    providers: [
      PlannerSolverService,
      { provide: PLANNER_SOLVE_RUNNER, useValue: runner },
      { provide: PLANNER_SOLVER_ADAPTER_FACTORY, useValue: adapterFactory },
    ],
  });

  return {
    adapters,
    runnerCalls,
    service: injector.get(PlannerSolverService),
  };
}

function createProject(
  targets: ReadonlyArray<{ itemId: string }>,
  dataset: GameDataset = tinySatisfactoryDataset,
): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset,
    now: NOW,
    targets: targets.map((target, index) => ({
      id: `target-${index}`,
      itemId: target.itemId,
      mode: 'fixed',
      amountPerMinute: 10,
      sortOrder: index,
    })),
  });
}

function createSolveInput(project: PlannerProject): PlannerSolveInput {
  const input = selectPlannerSolveInput(project, tinySatisfactoryDataset);
  if (!input) {
    throw new Error('Expected planner solve input');
  }
  return input;
}

function createAdapter(id: string): ProductionSolverAdapter {
  return {
    id,
    solve: () => Promise.resolve(createResult()),
  };
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

interface RunnerCall {
  adapter: ProductionSolverAdapter;
  input: Parameters<PlannerSolveRunner>[0];
}
