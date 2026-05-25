import {
  createEmptyProductionPlanResult,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { HighsProductionSolverAdapter } from './highsAdapter';
import type { ProductionSolverAdapter } from './SolverAdapter';
import type { ProductionPlanInput } from './lpModel';
import { analyzePowerTargets } from './powerTargets';

export { createEmptyProductionPlanResult } from '@beltwise/planner-core';

export async function solveProductionPlan(
  input: ProductionPlanInput,
  adapter: ProductionSolverAdapter = new HighsProductionSolverAdapter(),
): Promise<ProductionPlanResult> {
  const powerTargetAnalysis = analyzePowerTargets(input.dataset, input.project);
  if (input.project.targets.length === 0 && powerTargetAnalysis.activeTargets.length === 0) {
    return {
      ...createEmptyProductionPlanResult(),
      warnings: powerTargetAnalysis.warnings,
    };
  }

  return adapter.solve(input);
}
