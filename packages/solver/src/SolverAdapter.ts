import type { ProductionPlanResult } from '@beltwise/planner-core';
import type { ProductionLpModel, ProductionPlanInput } from './lpModel';

export interface LinearSolverResult {
  status: 'optimal' | 'infeasible' | 'unbounded' | 'error';
  objectiveValue?: number;
  variables: Record<string, number>;
  message?: string;
}

export interface LinearSolverAdapter {
  readonly id: string;
  solve(model: ProductionLpModel): Promise<LinearSolverResult>;
}

export interface ProductionSolverAdapter {
  readonly id: string;
  solve(input: ProductionPlanInput): Promise<ProductionPlanResult>;
}
