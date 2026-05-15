import type { ProductionPlanResult } from '@beltwise/planner-core';
import { HighsProductionSolverAdapter } from './highsAdapter';
import type { ProductionSolverAdapter } from './SolverAdapter';
import type { ProductionPlanInput } from './lpModel';

export async function solveProductionPlan(
  input: ProductionPlanInput,
  adapter: ProductionSolverAdapter = new HighsProductionSolverAdapter(),
): Promise<ProductionPlanResult> {
  if (input.project.targets.length === 0) {
    return createEmptyProductionPlanResult();
  }

  return adapter.solve(input);
}

export function createEmptyProductionPlanResult(): ProductionPlanResult {
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
    warnings: []
  };
}
