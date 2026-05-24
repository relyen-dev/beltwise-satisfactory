import { describe, expect, it } from 'vitest';
import {
  solveLexicographicProductionLp,
  type LinearSolverAdapter,
  type LinearSolverResult,
  type ProductionLpModel,
} from '@beltwise/solver';

class RecordingLinearSolver implements LinearSolverAdapter {
  public readonly id = 'recording-linear-solver';
  public readonly models: ProductionLpModel[] = [];

  public constructor(private readonly solveNext: () => LinearSolverResult) {}

  public async solve(model: ProductionLpModel): Promise<LinearSolverResult> {
    this.models.push(model);
    return this.solveNext();
  }
}

function lexicographicFixtureModel(): ProductionLpModel {
  return {
    variables: [
      { name: 'rawInput:ore', lowerBound: 0 },
      { name: 'recipeRate:widget', lowerBound: 0 },
    ],
    constraints: [],
    objective: {
      direction: 'minimize',
      coefficients: {
        'rawInput:ore': 2,
        'recipeRate:widget': 0,
      },
    },
    objectiveStages: [
      {
        name: 'raw-resources',
        objective: {
          direction: 'minimize',
          coefficients: {
            'rawInput:ore': 2,
            'recipeRate:widget': 0,
          },
        },
      },
      {
        name: 'power',
        objective: {
          direction: 'minimize',
          coefficients: {
            'rawInput:ore': 0,
            'recipeRate:widget': 3,
          },
        },
      },
    ],
    metadata: {
      recipeVariableById: {},
      rawInputVariableByItemId: {
        ore: 'rawInput:ore',
      },
      externalInputVariableByItemId: {},
      assumedInputVariableByItemId: {},
      surplusVariableByItemId: {},
      maximizeVariableByTargetId: {},
      powerGeneratorVariableByTargetId: {},
      activePowerTargetById: {},
      powerTargetWarnings: [],
    },
  };
}

describe('solveLexicographicProductionLp', () => {
  it('locks earlier numeric stages before solving later tie-breakers', async () => {
    const responses: LinearSolverResult[] = [
      {
        status: 'optimal',
        variables: {
          'rawInput:ore': 10,
          'recipeRate:widget': 4,
        },
      },
      {
        status: 'optimal',
        variables: {
          'rawInput:ore': 10,
          'recipeRate:widget': 1,
        },
      },
    ];
    const solver = new RecordingLinearSolver(() => {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected solve call.');
      }
      return response;
    });

    const result = await solveLexicographicProductionLp(lexicographicFixtureModel(), solver);

    expect(result.status).toBe('optimal');
    expect(result.variables['recipeRate:widget']).toBe(1);
    expect(solver.models).toHaveLength(2);
    expect(solver.models[1]?.objective).toMatchObject({
      direction: 'minimize',
      coefficients: {
        'recipeRate:widget': 3,
      },
    });
    expect(
      solver.models[1]?.constraints.find((constraint) => constraint.name === 'lex:raw-resources:0'),
    ).toMatchObject({
      coefficients: {
        'rawInput:ore': 1,
      },
      sense: 'lte',
      rhs: 10.000000001,
    });
    expect(
      solver.models[1]?.constraints.find(
        (constraint) => constraint.name === 'lex:raw-resources:0:raw-input:0',
      ),
    ).toMatchObject({
      coefficients: {
        'rawInput:ore': 1,
      },
      sense: 'lte',
      rhs: 10.000001,
    });
  });

  it('keeps the previous optimum when later numeric locks cannot be relaxed enough', async () => {
    let callCount = 0;
    const solver = new RecordingLinearSolver(() => {
      callCount += 1;
      if (callCount === 1) {
        return {
          status: 'optimal',
          variables: {
            'rawInput:ore': 10,
            'recipeRate:widget': 4,
          },
        };
      }
      return {
        status: 'infeasible',
        variables: {},
        message: 'tie-breaker infeasible',
      };
    });

    const result = await solveLexicographicProductionLp(lexicographicFixtureModel(), solver);

    expect(result).toMatchObject({
      status: 'optimal',
      variables: {
        'rawInput:ore': 10,
        'recipeRate:widget': 4,
      },
    });
    expect(callCount).toBeGreaterThan(2);
  });

  it('retries an infeasible later stage with a relaxed numeric lock', async () => {
    let callCount = 0;
    const solver = new RecordingLinearSolver(() => {
      callCount += 1;
      if (callCount === 1) {
        return {
          status: 'optimal',
          variables: {
            'rawInput:ore': 10,
            'recipeRate:widget': 4,
          },
        };
      }
      if (callCount === 2) {
        return {
          status: 'infeasible',
          variables: {},
          message: 'strict lock infeasible',
        };
      }
      return {
        status: 'optimal',
        variables: {
          'rawInput:ore': 10.00000001,
          'recipeRate:widget': 1,
        },
      };
    });

    const result = await solveLexicographicProductionLp(lexicographicFixtureModel(), solver);

    expect(result.status).toBe('optimal');
    expect(result.variables['recipeRate:widget']).toBe(1);
    expect(solver.models).toHaveLength(3);
    expect(
      solver.models[2]?.constraints.find((constraint) => constraint.name === 'lex:raw-resources:0'),
    ).toMatchObject({
      rhs: 10.00000001,
    });
  });

  it('prefixes first-stage failures with the objective stage name', async () => {
    const solver = new RecordingLinearSolver(() => ({
      status: 'error',
      variables: {},
      message: 'runtime failed',
    }));

    const result = await solveLexicographicProductionLp(lexicographicFixtureModel(), solver);

    expect(result).toEqual({
      status: 'error',
      variables: {},
      message: 'raw-resources: runtime failed',
    });
  });

  it('locks maximized target outputs exactly before later objective stages', async () => {
    const model: ProductionLpModel = {
      ...lexicographicFixtureModel(),
      variables: [
        { name: 'maximizeTarget:plate', lowerBound: 0 },
        { name: 'recipeRate:widget', lowerBound: 0 },
      ],
      objective: {
        direction: 'maximize',
        coefficients: {
          'maximizeTarget:plate': 1,
          'recipeRate:widget': 0,
        },
      },
      objectiveStages: [
        {
          name: 'target-output',
          objective: {
            direction: 'maximize',
            coefficients: {
              'maximizeTarget:plate': 1,
              'recipeRate:widget': 0,
            },
          },
        },
        {
          name: 'power',
          objective: {
            direction: 'minimize',
            coefficients: {
              'maximizeTarget:plate': 0,
              'recipeRate:widget': 1,
            },
          },
        },
      ],
      metadata: {
        recipeVariableById: {},
        rawInputVariableByItemId: {},
        externalInputVariableByItemId: {},
        assumedInputVariableByItemId: {},
        surplusVariableByItemId: {},
        maximizeVariableByTargetId: {
          'target-plate': 'maximizeTarget:plate',
        },
        powerGeneratorVariableByTargetId: {},
        activePowerTargetById: {},
        powerTargetWarnings: [],
      },
    };
    const responses: LinearSolverResult[] = [
      {
        status: 'optimal',
        variables: {
          'maximizeTarget:plate': 42,
          'recipeRate:widget': 4,
        },
      },
      {
        status: 'optimal',
        variables: {
          'maximizeTarget:plate': 42,
          'recipeRate:widget': 1,
        },
      },
    ];
    const solver = new RecordingLinearSolver(() => {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected solve call.');
      }
      return response;
    });

    const result = await solveLexicographicProductionLp(model, solver);

    expect(result.status).toBe('optimal');
    expect(solver.models[1]?.constraints).toContainEqual({
      name: 'lex:target-output:0:0',
      coefficients: {
        'maximizeTarget:plate': 1,
      },
      sense: 'eq',
      rhs: 42,
    });
  });
});
