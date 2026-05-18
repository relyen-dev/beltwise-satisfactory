import type { LinearSolverResult } from './SolverAdapter';
import type { HighsLpSerialization } from './highsLpSerialization';
import type { ProductionLpModel } from './lpModel';

const EPSILON = 0.000000001;

export interface HighsSolution {
  Status: string;
  ObjectiveValue?: number;
  Columns?: Record<string, unknown>;
}

export function mapHighsSolutionToLinearResult(
  model: ProductionLpModel,
  serialized: HighsLpSerialization,
  solution: HighsSolution,
): LinearSolverResult {
  const status = mapHighsStatus(solution.Status);
  if (status !== 'optimal') {
    return {
      status,
      variables: {},
      message: `HiGHS returned ${solution.Status}.`,
    };
  }

  return {
    status: 'optimal',
    objectiveValue: cleanNumber(solution.ObjectiveValue ?? Number.NaN),
    variables: extractVariableValues(model, serialized, solution.Columns ?? {}),
  };
}

function extractVariableValues(
  model: ProductionLpModel,
  serialized: HighsLpSerialization,
  columns: Record<string, unknown>,
): Record<string, number> {
  const variables: Record<string, number> = {};
  for (const variable of model.variables) {
    const lpName = serialized.lpNameByVariableName[variable.name];
    if (!lpName) {
      continue;
    }
    variables[variable.name] = cleanNumber(columnPrimalValue(columns[lpName]));
  }
  return variables;
}

function columnPrimalValue(column: unknown): number {
  if (typeof column !== 'object' || column === null || !('Primal' in column)) {
    return 0;
  }
  const primal = column.Primal;
  return typeof primal === 'number' && Number.isFinite(primal) ? primal : 0;
}

function mapHighsStatus(status: string): LinearSolverResult['status'] {
  if (status === 'Optimal' || status === 'Empty') {
    return 'optimal';
  }
  if (status === 'Infeasible') {
    return 'infeasible';
  }
  if (status === 'Unbounded') {
    return 'unbounded';
  }
  return 'error';
}

function cleanNumber(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
