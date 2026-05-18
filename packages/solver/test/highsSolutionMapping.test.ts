import { describe, expect, it } from 'vitest';
import type { HighsLpSerialization, ProductionLpModel } from '@beltwise/solver';
import { mapHighsSolutionToLinearResult } from '../src/highsSolutionMapping';

function solutionModel(): ProductionLpModel {
  return {
    variables: [
      { name: 'unsafe:x/with/slashes', lowerBound: 0 },
      { name: 'tiny', lowerBound: 0 },
      { name: 'missing', lowerBound: 0 },
    ],
    constraints: [],
    objective: {
      direction: 'minimize',
      coefficients: {
        'unsafe:x/with/slashes': 1,
        tiny: 1,
        missing: 1,
      },
    },
    objectiveStages: [],
    metadata: {
      recipeVariableById: {},
      rawInputVariableByItemId: {},
      externalInputVariableByItemId: {},
      surplusVariableByItemId: {},
      maximizeVariableByTargetId: {},
    },
  };
}

function serialization(): HighsLpSerialization {
  return {
    lpText: '',
    lpNameByVariableName: {
      'unsafe:x/with/slashes': 'x0',
      tiny: 'x1',
      missing: 'x2',
    },
    variableNameByLpName: {
      x0: 'unsafe:x/with/slashes',
      x1: 'tiny',
      x2: 'missing',
    },
  };
}

describe('mapHighsSolutionToLinearResult', () => {
  it('maps optimal HiGHS columns back to production variable names', () => {
    const result = mapHighsSolutionToLinearResult(solutionModel(), serialization(), {
      Status: 'Optimal',
      ObjectiveValue: 0.0000000001,
      Columns: {
        x0: {
          Primal: 5,
        },
        x1: {
          Primal: 0.0000000001,
        },
      },
    });

    expect(result).toEqual({
      status: 'optimal',
      objectiveValue: 0,
      variables: {
        'unsafe:x/with/slashes': 5,
        tiny: 0,
        missing: 0,
      },
    });
  });

  it('preserves non-optimal HiGHS statuses without exposing stale variables', () => {
    expect(
      mapHighsSolutionToLinearResult(solutionModel(), serialization(), {
        Status: 'Infeasible',
        ObjectiveValue: 12,
        Columns: {
          x0: {
            Primal: 5,
          },
        },
      }),
    ).toEqual({
      status: 'infeasible',
      variables: {},
      message: 'HiGHS returned Infeasible.',
    });

    expect(
      mapHighsSolutionToLinearResult(solutionModel(), serialization(), {
        Status: 'Unbounded',
        Columns: {},
      }).status,
    ).toBe('unbounded');
    expect(
      mapHighsSolutionToLinearResult(solutionModel(), serialization(), {
        Status: 'Something Else',
        Columns: {},
      }).status,
    ).toBe('error');
  });
});
