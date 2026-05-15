import '@angular/compiler';
import { Injector } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { type ProductionPlanInput, type ProductionSolverAdapter } from '@beltwise/solver';
import { describe, expect, it, vi } from 'vitest';
import {
  PLANNER_SOLVER_MODULE_LOADER,
  PlannerProductionSolverService,
  type PlannerSolverModule,
  type PlannerSolverModuleLoader,
} from './planner-production-solver.service';

const NOW = '2026-05-12T00:00:00.000Z';

describe('PlannerProductionSolverService', () => {
  it('does not load the solver module until a solve is requested', () => {
    const solverModule = createSolverModule();
    const loader: PlannerSolverModuleLoader = vi.fn(() => Promise.resolve(solverModule.module));

    createSolverHarness(loader);

    expect(loader).not.toHaveBeenCalled();
  });

  it('loads the solver module once and reuses one adapter instance', async () => {
    const solverModule = createSolverModule();
    const loader: PlannerSolverModuleLoader = vi.fn(() => Promise.resolve(solverModule.module));
    const service = createSolverHarness(loader);
    const input = createInput('Desc_IronPlate_C');

    await service.solve(input);
    await service.solve(createInput('Desc_Wire_C'));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(solverModule.adapters).toHaveLength(1);
    expect(solverModule.solveProductionPlan).toHaveBeenCalledTimes(2);
    expect(solverModule.solveProductionPlan.mock.calls[0]?.[0]).toBe(input);
    expect(solverModule.solveProductionPlan.mock.calls[0]?.[1]).toBe(solverModule.adapters[0]);
    expect(solverModule.solveProductionPlan.mock.calls[1]?.[1]).toBe(solverModule.adapters[0]);
  });

  it('shares a pending dynamic import between concurrent solves', async () => {
    const solverModule = createSolverModule();
    const pendingModule = createDeferred<PlannerSolverModule>();
    const loader: PlannerSolverModuleLoader = vi.fn(() => pendingModule.promise);
    const service = createSolverHarness(loader);

    const firstSolve = service.solve(createInput('Desc_IronPlate_C'));
    const secondSolve = service.solve(createInput('Desc_Wire_C'));

    expect(loader).toHaveBeenCalledTimes(1);
    pendingModule.resolve(solverModule.module);
    await Promise.all([firstSolve, secondSolve]);

    expect(solverModule.adapters).toHaveLength(1);
    expect(solverModule.solveProductionPlan).toHaveBeenCalledTimes(2);
  });

  it('retries loading the solver module after a failed dynamic import', async () => {
    const solverModule = createSolverModule();
    const loadResults: Array<Promise<PlannerSolverModule>> = [
      Promise.reject(new Error('Solver chunk unavailable')),
      Promise.resolve(solverModule.module),
    ];
    const loader: PlannerSolverModuleLoader = vi.fn(() => {
      const nextResult = loadResults.shift();
      if (!nextResult) {
        throw new Error('Unexpected solver module load');
      }
      return nextResult;
    });
    const service = createSolverHarness(loader);

    await expect(service.solve(createInput('Desc_IronPlate_C'))).rejects.toThrow(
      'Solver chunk unavailable',
    );
    await service.solve(createInput('Desc_Wire_C'));

    expect(loader).toHaveBeenCalledTimes(2);
    expect(solverModule.solveProductionPlan).toHaveBeenCalledTimes(1);
  });
});

function createSolverHarness(loader: PlannerSolverModuleLoader): PlannerProductionSolverService {
  const injector = Injector.create({
    providers: [
      PlannerProductionSolverService,
      { provide: PLANNER_SOLVER_MODULE_LOADER, useValue: loader },
    ],
  });

  return injector.get(PlannerProductionSolverService);
}

function createSolverModule() {
  const adapters: ProductionSolverAdapter[] = [];

  class FakeHighsProductionSolverAdapter implements ProductionSolverAdapter {
    public readonly id = `adapter-${adapters.length + 1}`;

    public constructor() {
      adapters.push(this);
    }

    public solve(): Promise<ProductionPlanResult> {
      return Promise.resolve(createResult());
    }
  }

  const solveProductionPlan = vi.fn(
    (_input: ProductionPlanInput, _adapter?: ProductionSolverAdapter) =>
      Promise.resolve(createResult()),
  );

  return {
    adapters,
    module: {
      HighsProductionSolverAdapter: FakeHighsProductionSolverAdapter,
      solveProductionPlan,
    },
    solveProductionPlan,
  };
}

function createInput(itemId: string): ProductionPlanInput {
  return {
    dataset: tinySatisfactoryDataset,
    project: createProject([{ itemId }]),
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
