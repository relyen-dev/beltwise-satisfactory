import {
  type EffectRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import { type ProductionPlanResult } from '@beltwise/planner-core';
import {
  createEmptyProductionPlanResult,
  HighsProductionSolverAdapter,
  solveProductionPlan,
  type ProductionPlanInput,
  type ProductionSolverAdapter,
} from '@beltwise/solver';
import { type PlannerSolveInput } from './planner-solve-input';

export type SolveStatus = 'idle' | 'solving' | 'solved' | 'error';

interface ScheduledPlannerSolve {
  solveInput: PlannerSolveInput;
  serial: number;
}

export const PLANNER_SOLVE_DEBOUNCE_MS = 150;

export class PlannerSolveScheduler<TInput> {
  private pendingTimeout: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly delayMs: number) {}

  public schedule(input: TInput, callback: (input: TInput) => void): void {
    this.cancel();
    this.pendingTimeout = setTimeout(() => {
      this.pendingTimeout = undefined;
      callback(input);
    }, this.delayMs);
  }

  public cancel(): void {
    if (this.pendingTimeout === undefined) {
      return;
    }
    clearTimeout(this.pendingTimeout);
    this.pendingTimeout = undefined;
  }
}

export type PlannerSolveRunner = (
  input: ProductionPlanInput,
  adapter: ProductionSolverAdapter,
) => Promise<ProductionPlanResult>;

export const PLANNER_SOLVE_RUNNER = new InjectionToken<PlannerSolveRunner>(
  'Beltwise planner solve runner',
  {
    providedIn: 'root',
    factory: () => (input, adapter) => solveProductionPlan(input, adapter),
  },
);

export type PlannerSolverAdapterFactory = () => ProductionSolverAdapter;

export const PLANNER_SOLVER_ADAPTER_FACTORY = new InjectionToken<PlannerSolverAdapterFactory>(
  'Beltwise planner solver adapter factory',
  {
    providedIn: 'root',
    factory: () => () => new HighsProductionSolverAdapter(),
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerSolverService {
  private readonly injector = inject(Injector);
  private readonly solveRunner = inject(PLANNER_SOLVE_RUNNER);
  private readonly createSolverAdapter = inject(PLANNER_SOLVER_ADAPTER_FACTORY);
  private solveEffect: EffectRef | undefined;
  private solveSerial = 0;
  private solverAdapter: ProductionSolverAdapter | undefined;
  private readonly solveScheduler = new PlannerSolveScheduler<ScheduledPlannerSolve>(
    PLANNER_SOLVE_DEBOUNCE_MS,
  );

  public readonly solveStatus = signal<SolveStatus>('idle');
  public readonly solveError = signal<string | null>(null);
  public readonly solveResult = signal<ProductionPlanResult | null>(null);

  public connect(solveInput: Signal<PlannerSolveInput | null>): void {
    this.solveEffect?.destroy();
    this.solveEffect = effect(() => this.requestSolve(solveInput()), {
      injector: this.injector,
    });
  }

  public requestSolve(solveInput: PlannerSolveInput | null): void {
    if (!solveInput) {
      this.cancelPendingSolve();
      return;
    }

    const serial = ++this.solveSerial;
    this.solveError.set(null);

    if (solveInput.project.targets.length === 0) {
      this.solveScheduler.cancel();
      this.solveResult.set(createEmptyProductionPlanResult());
      this.solveStatus.set('solved');
      return;
    }

    this.solveStatus.set('solving');
    this.solveScheduler.schedule({ solveInput, serial }, (scheduledSolve) =>
      this.runScheduledSolve(scheduledSolve),
    );
  }

  private runScheduledSolve({ solveInput, serial }: ScheduledPlannerSolve): void {
    void this.solveRunner(
      { dataset: solveInput.dataset, project: solveInput.project },
      this.getSolverAdapter(),
    )
      .then((result) => {
        if (serial !== this.solveSerial) {
          return;
        }
        this.solveResult.set(result);
        this.solveStatus.set('solved');
      })
      .catch((error: unknown) => {
        if (serial !== this.solveSerial) {
          return;
        }
        this.solveResult.set(null);
        this.solveError.set(error instanceof Error ? error.message : 'Solving failed');
        this.solveStatus.set('error');
      });
  }

  private cancelPendingSolve(): void {
    this.solveSerial += 1;
    this.solveScheduler.cancel();
  }

  private getSolverAdapter(): ProductionSolverAdapter {
    this.solverAdapter ??= this.createSolverAdapter();
    return this.solverAdapter;
  }
}
