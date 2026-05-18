import { describe, expect, it } from 'vitest';
import {
  dumpProductionLpAsHighsLp,
  HighsLinearSolverAdapter,
  solveLexicographicProductionLp,
  type ProductionLpModel,
} from '@beltwise/solver';

function smokeModel(): ProductionLpModel {
  return {
    variables: [
      {
        name: 'unsafe:x/with/slashes',
        lowerBound: 0,
      },
    ],
    constraints: [
      {
        name: 'minimum:x',
        coefficients: {
          'unsafe:x/with/slashes': 1,
        },
        sense: 'gte',
        rhs: 5,
      },
    ],
    objective: {
      direction: 'minimize',
      coefficients: {
        'unsafe:x/with/slashes': 1,
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

describe('HighsLinearSolverAdapter', () => {
  it('solves a direct LP smoke test', async () => {
    const result = await new HighsLinearSolverAdapter().solve(smokeModel());

    expect(result.status).toBe('optimal');
    expect(result.variables['unsafe:x/with/slashes']).toBeCloseTo(5, 8);
  });

  it('reads raw HiGHS solution values instead of truncated pretty output', async () => {
    const result = await new HighsLinearSolverAdapter().solve({
      variables: [
        {
          name: 'x',
          lowerBound: 0,
        },
      ],
      constraints: [
        {
          name: 'thirds',
          coefficients: {
            x: 3,
          },
          sense: 'eq',
          rhs: 10,
        },
      ],
      objective: {
        direction: 'minimize',
        coefficients: {
          x: 1,
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
    });

    expect(result.status).toBe('optimal');
    expect(result.variables['x']).toBeCloseTo(10 / 3, 12);
  });

  it('dumps HiGHS LP text with generated variable names', () => {
    const lpText = dumpProductionLpAsHighsLp(smokeModel());

    expect(lpText).toContain('x0');
    expect(lpText).not.toContain('unsafe:x/with/slashes');
  });

  it('keeps the package-level lexicographic helper backed by HiGHS by default', async () => {
    const result = await solveLexicographicProductionLp(smokeModel());

    expect(result.status).toBe('optimal');
    expect(result.variables['unsafe:x/with/slashes']).toBeCloseTo(5, 8);
  });
});
