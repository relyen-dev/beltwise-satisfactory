import type { LinearSolverAdapter, LinearSolverResult } from './SolverAdapter';
import { HighsLinearSolverAdapter } from './highsAdapter';
import type { ProductionLpModel } from './lpModel';
import { solveLexicographicProductionLpWithSolver } from './lexicographicProductionLpCore';

export { solveLexicographicProductionLpWithSolver } from './lexicographicProductionLpCore';

export async function solveLexicographicProductionLp(
  model: ProductionLpModel,
  linearSolver: LinearSolverAdapter = new HighsLinearSolverAdapter(),
): Promise<LinearSolverResult> {
  return solveLexicographicProductionLpWithSolver(model, linearSolver);
}
