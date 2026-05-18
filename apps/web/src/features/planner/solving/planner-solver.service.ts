import {
  type EffectRef,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import {
  createEmptyProductionPlanResult,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { type PlannerSolveInput } from './planner-solve-input';
import { PlannerProductionSolverService } from './planner-production-solver.service';

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

@Injectable({ providedIn: 'root' })
export class PlannerSolverService {
  private readonly injector = inject(Injector);
  private readonly productionSolver = inject(PlannerProductionSolverService);
  private solveEffect: EffectRef | undefined;
  private solveSerial = 0;
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
    void this.productionSolver
      .solve({ dataset: solveInput.dataset, project: solveInput.project })
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
}
