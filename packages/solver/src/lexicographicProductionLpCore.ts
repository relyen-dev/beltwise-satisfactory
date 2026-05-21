import type { LinearSolverAdapter, LinearSolverResult } from './SolverAdapter';
import type {
  LpConstraint,
  LpObjective,
  ProductionLpModel,
  ProductionObjectiveStage,
} from './lpModel';

const EPSILON = 0.000000001;
const LEXICOGRAPHIC_ABSOLUTE_TOLERANCE = 0.0000000001;
const LEXICOGRAPHIC_RELATIVE_TOLERANCE = 0.0000000001;
const LEXICOGRAPHIC_MAX_RELAXED_TOLERANCE = 0.000001;
const RAW_INPUT_PROFILE_TOLERANCE_PER_MINUTE = 0.000001;

interface LexicographicLock {
  stage: ProductionObjectiveStage;
  stageIndex: number;
  variables: Record<string, number>;
  objectiveValue: number;
  tolerance: number;
}

export async function solveLexicographicProductionLpWithSolver(
  model: ProductionLpModel,
  linearSolver: LinearSolverAdapter,
): Promise<LinearSolverResult> {
  const stages =
    model.objectiveStages.length > 0
      ? model.objectiveStages
      : [
          {
            name: 'raw-resources',
            objective: model.objective,
          } satisfies ProductionObjectiveStage,
        ];
  let workingModel = withObjective(model, stages[0]?.objective ?? model.objective);
  let latestResult: LinearSolverResult | undefined;
  const locks: LexicographicLock[] = [];

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    if (!stage) {
      continue;
    }

    let result: LinearSolverResult;
    while (true) {
      workingModel = withObjective(withLockConstraints(model, locks), stage.objective);
      result = await linearSolver.solve(workingModel);
      if (result.status === 'optimal') {
        break;
      }
      if (result.status === 'infeasible' && relaxMostRecentNumericLock(locks)) {
        continue;
      }
      if (result.status === 'infeasible' && latestResult) {
        return latestResult;
      }
      return {
        ...result,
        message: result.message
          ? `${stage.name}: ${result.message}`
          : `${stage.name}: solve failed`,
      };
    }

    latestResult = result;
    if (stageIndex < stages.length - 1) {
      locks.push(createLexicographicLock(stage, result.variables, stageIndex));
    }
  }

  return latestResult ?? linearSolver.solve(model);
}

function createLexicographicLock(
  stage: ProductionObjectiveStage,
  variables: Record<string, number>,
  stageIndex: number,
): LexicographicLock {
  const objectiveValue = evaluateObjective(stage.objective, variables);
  return {
    stage,
    stageIndex,
    variables,
    objectiveValue,
    tolerance: objectiveLockTolerance(objectiveValue),
  };
}

function withLockConstraints(
  model: ProductionLpModel,
  locks: ReadonlyArray<LexicographicLock>,
): ProductionLpModel {
  return withAdditionalConstraints(
    model,
    locks.flatMap((lock) => buildLexicographicLockConstraints(model, lock)),
  );
}

function buildLexicographicLockConstraints(
  model: ProductionLpModel,
  lock: LexicographicLock,
): LpConstraint[] {
  if (lock.stage.name === 'target-output') {
    return Object.values(model.metadata.maximizeVariableByTargetId).map(
      (variableName, variableIndex) => ({
        name: `lex:${lock.stage.name}:${lock.stageIndex}:${variableIndex}`,
        coefficients: { [variableName]: 1 },
        sense: 'eq',
        rhs: cleanNumber(lock.variables[variableName] ?? 0),
      }),
    );
  }

  if (!hasMeaningfulCoefficient(lock.stage.objective)) {
    return [];
  }

  const coefficientScale = objectiveLockCoefficientScale(lock.stage.objective);

  const objectiveLockConstraint: LpConstraint = {
    name: `lex:${lock.stage.name}:${lock.stageIndex}`,
    coefficients: scaledCoefficients(lock.stage.objective.coefficients, coefficientScale),
    sense: lock.stage.objective.direction === 'maximize' ? 'gte' : 'lte',
    rhs: cleanNumber(objectiveLockRhs(lock) * coefficientScale),
  };

  return [objectiveLockConstraint, ...buildRawInputProfileLockConstraints(model, lock)];
}

function objectiveLockRhs(lock: LexicographicLock): number {
  return lock.stage.objective.direction === 'maximize'
    ? lock.objectiveValue - lock.tolerance
    : lock.objectiveValue + lock.tolerance;
}

function objectiveLockCoefficientScale(objective: LpObjective): number {
  const largestCoefficient = Math.max(
    0,
    ...Object.values(objective.coefficients).map((coefficient) => Math.abs(coefficient)),
  );
  if (largestCoefficient <= EPSILON || !Number.isFinite(largestCoefficient)) {
    return 1;
  }
  return 1 / largestCoefficient;
}

function scaledCoefficients(
  coefficients: Record<string, number>,
  scale: number,
): Record<string, number> {
  if (scale === 1) {
    return { ...coefficients };
  }
  return Object.fromEntries(
    Object.entries(coefficients).map(([variableName, coefficient]) => [
      variableName,
      cleanNumber(coefficient * scale),
    ]),
  );
}

function buildRawInputProfileLockConstraints(
  model: ProductionLpModel,
  lock: LexicographicLock,
): LpConstraint[] {
  if (lock.stage.name !== 'raw-resources') {
    return [];
  }

  // Stabilize the raw-resource solve so later tie-breakers cannot introduce tiny extra inputs.
  return [
    ...Object.values(model.metadata.rawInputVariableByItemId).map(
      (variableName, variableIndex) => ({
        name: `lex:${lock.stage.name}:${lock.stageIndex}:raw-input:${variableIndex}`,
        coefficients: { [variableName]: 1 },
        sense: 'lte' as const,
        rhs: cleanNumber(
          (lock.variables[variableName] ?? 0) + RAW_INPUT_PROFILE_TOLERANCE_PER_MINUTE,
        ),
      }),
    ),
    ...Object.values(model.metadata.assumedInputVariableByItemId).map(
      (variableName, variableIndex) => ({
        name: `lex:${lock.stage.name}:${lock.stageIndex}:assumed-input:${variableIndex}`,
        coefficients: { [variableName]: 1 },
        sense: 'lte' as const,
        rhs: cleanNumber(
          (lock.variables[variableName] ?? 0) + RAW_INPUT_PROFILE_TOLERANCE_PER_MINUTE,
        ),
      }),
    ),
  ];
}

function relaxMostRecentNumericLock(locks: LexicographicLock[]): boolean {
  for (let index = locks.length - 1; index >= 0; index -= 1) {
    const lock = locks[index];
    if (!lock || lock.stage.name === 'target-output') {
      continue;
    }
    if (lock.tolerance >= LEXICOGRAPHIC_MAX_RELAXED_TOLERANCE) {
      continue;
    }
    lock.tolerance = Math.min(lock.tolerance * 10, LEXICOGRAPHIC_MAX_RELAXED_TOLERANCE);
    return true;
  }
  return false;
}

function withObjective(model: ProductionLpModel, objective: LpObjective): ProductionLpModel {
  return {
    ...model,
    objective,
  };
}

function withAdditionalConstraints(
  model: ProductionLpModel,
  constraints: LpConstraint[],
): ProductionLpModel {
  if (constraints.length === 0) {
    return model;
  }
  return {
    ...model,
    constraints: [...model.constraints, ...constraints],
  };
}

function evaluateObjective(objective: LpObjective, variables: Record<string, number>): number {
  return cleanNumber(
    Object.entries(objective.coefficients).reduce(
      (total, [variableName, coefficient]) => total + coefficient * (variables[variableName] ?? 0),
      0,
    ),
  );
}

function objectiveLockTolerance(value: number): number {
  return Math.max(
    LEXICOGRAPHIC_ABSOLUTE_TOLERANCE,
    Math.abs(value) * LEXICOGRAPHIC_RELATIVE_TOLERANCE,
  );
}

function hasMeaningfulCoefficient(objective: LpObjective): boolean {
  return Object.values(objective.coefficients).some(
    (coefficient) => Math.abs(coefficient) > EPSILON,
  );
}

function cleanNumber(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
