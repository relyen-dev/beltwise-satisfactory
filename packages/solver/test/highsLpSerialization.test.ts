import { describe, expect, it } from 'vitest';
import { serializeProductionLpModelToHighsLp, type ProductionLpModel } from '@beltwise/solver';

function serializationModel(): ProductionLpModel {
  return {
    variables: [
      { name: 'unsafe:x/with/slashes', lowerBound: 0 },
      { name: 'bounded variable', lowerBound: 2.5, upperBound: 7.25 },
      { name: 'fixed variable', lowerBound: 3, upperBound: 3 },
    ],
    constraints: [
      {
        name: 'minimum:x',
        coefficients: {
          'unsafe:x/with/slashes': 1,
          'bounded variable': -2,
        },
        sense: 'gte',
        rhs: 5,
      },
    ],
    objective: {
      direction: 'maximize',
      coefficients: {
        'unsafe:x/with/slashes': 1,
        'bounded variable': 0.5,
        'fixed variable': -1,
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

describe('serializeProductionLpModelToHighsLp', () => {
  it('maps unsafe production variable names to stable LP names', () => {
    const serialized = serializeProductionLpModelToHighsLp(serializationModel());

    expect(serialized.lpNameByVariableName).toEqual({
      'unsafe:x/with/slashes': 'x0',
      'bounded variable': 'x1',
      'fixed variable': 'x2',
    });
    expect(serialized.variableNameByLpName).toEqual({
      x0: 'unsafe:x/with/slashes',
      x1: 'bounded variable',
      x2: 'fixed variable',
    });
    expect(serialized.lpText).not.toContain('unsafe:x/with/slashes');
    expect(serialized.lpText).not.toContain('bounded variable');
    expect(serialized.lpText).not.toContain('fixed variable');
  });

  it('serializes objectives, constraints, and bounds for HiGHS LP input', () => {
    const { lpText } = serializeProductionLpModelToHighsLp(serializationModel());

    expect(lpText.split('\n')).toEqual([
      'Maximize',
      ' obj: + x0 + 0.5 x1 - x2',
      'Subject To',
      ' c0: + x0 - 2 x1 >= 5',
      'Bounds',
      ' x0 >= 0',
      ' 2.5 <= x1 <= 7.25',
      ' x2 = 3',
      'End',
    ]);
  });
});
