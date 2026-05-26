import { inject, Injectable, InjectionToken } from '@angular/core';
import type { ProductionPlanResult } from '@beltwise/planner-core';
import type { ProductionPlanInput, ProductionSolverAdapter } from '@beltwise/solver';
import {
  ApplicationUpdateNoticeService,
  ApplicationUpdateRequiredError,
} from '../../../app/application-update-notice.service';

export interface PlannerSolverModule {
  readonly HighsProductionSolverAdapter: new () => ProductionSolverAdapter;
  readonly solveProductionPlan: (
    input: ProductionPlanInput,
    adapter?: ProductionSolverAdapter,
  ) => Promise<ProductionPlanResult>;
}

export type PlannerSolverModuleLoader = () => Promise<PlannerSolverModule>;

export const PLANNER_SOLVER_MODULE_LOADER = new InjectionToken<PlannerSolverModuleLoader>(
  'Beltwise planner solver module loader',
  {
    providedIn: 'root',
    factory: () => () => import('@beltwise/solver'),
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerProductionSolverService {
  private readonly loadSolverModule = inject(PLANNER_SOLVER_MODULE_LOADER);
  private readonly updateNotice = inject(ApplicationUpdateNoticeService);
  private solverModulePromise: Promise<PlannerSolverModule> | undefined;
  private solverAdapter: ProductionSolverAdapter | undefined;

  public async solve(input: ProductionPlanInput): Promise<ProductionPlanResult> {
    const solverModule = await this.getSolverModule();
    const solverAdapter = this.getSolverAdapter(solverModule);
    return solverModule.solveProductionPlan(input, solverAdapter);
  }

  private getSolverModule(): Promise<PlannerSolverModule> {
    if (this.solverModulePromise) {
      return this.solverModulePromise;
    }

    const solverModulePromise = this.loadSolverModule().catch((error: unknown) => {
      if (this.solverModulePromise === solverModulePromise) {
        this.solverModulePromise = undefined;
      }
      if (this.updateNotice.notifyIfApplicationUpdateError(error)) {
        throw new ApplicationUpdateRequiredError(error);
      }
      throw error;
    });
    this.solverModulePromise = solverModulePromise;
    return solverModulePromise;
  }

  private getSolverAdapter(solverModule: PlannerSolverModule): ProductionSolverAdapter {
    this.solverAdapter ??= new solverModule.HighsProductionSolverAdapter();
    return this.solverAdapter;
  }
}
