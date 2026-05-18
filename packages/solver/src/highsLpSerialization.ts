import type { ProductionLpModel, LpConstraint } from './lpModel';

const EPSILON = 0.000000001;

export interface HighsLpSerialization {
  lpText: string;
  lpNameByVariableName: Record<string, string>;
  variableNameByLpName: Record<string, string>;
}

export function serializeProductionLpModelToHighsLp(
  model: ProductionLpModel,
): HighsLpSerialization {
  const lpNameByVariableName: Record<string, string> = {};
  const variableNameByLpName: Record<string, string> = {};

  model.variables.forEach((variable, index) => {
    const lpName = `x${index}`;
    lpNameByVariableName[variable.name] = lpName;
    variableNameByLpName[lpName] = variable.name;
  });

  const lines: string[] = [
    model.objective.direction === 'maximize' ? 'Maximize' : 'Minimize',
    ` obj: ${formatLinearExpression(model.objective.coefficients, model.variables, lpNameByVariableName)}`,
    'Subject To',
  ];

  model.constraints.forEach((constraint, index) => {
    lines.push(
      ` c${index}: ${formatLinearExpression(constraint.coefficients, model.variables, lpNameByVariableName)} ${formatConstraintSense(
        constraint.sense,
      )} ${formatNumber(constraint.rhs)}`,
    );
  });

  lines.push('Bounds');
  for (const variable of model.variables) {
    const lpName = lpNameByVariableName[variable.name];
    if (!lpName) {
      throw new Error(`Missing LP variable name for ${variable.name}`);
    }
    lines.push(` ${formatVariableBound(lpName, variable.lowerBound, variable.upperBound)}`);
  }
  lines.push('End');

  return {
    lpText: lines.join('\n'),
    lpNameByVariableName,
    variableNameByLpName,
  };
}

export function dumpProductionLpAsHighsLp(model: ProductionLpModel): string {
  return serializeProductionLpModelToHighsLp(model).lpText;
}

function formatLinearExpression(
  coefficients: Record<string, number>,
  variables: ReadonlyArray<{ name: string }>,
  lpNameByVariableName: Record<string, string>,
): string {
  const terms: string[] = [];
  for (const variable of variables) {
    const coefficient = coefficients[variable.name] ?? 0;
    if (Math.abs(coefficient) <= EPSILON) {
      continue;
    }
    const lpName = lpNameByVariableName[variable.name];
    if (!lpName) {
      throw new Error(`Missing LP variable name for ${variable.name}`);
    }
    terms.push(formatLinearTerm(coefficient, lpName));
  }
  return terms.length > 0 ? terms.join(' ') : '0';
}

function formatLinearTerm(coefficient: number, lpName: string): string {
  const sign = coefficient < 0 ? '-' : '+';
  const absoluteCoefficient = Math.abs(coefficient);
  const coefficientText =
    Math.abs(absoluteCoefficient - 1) <= EPSILON ? '' : `${formatNumber(absoluteCoefficient)} `;
  return `${sign} ${coefficientText}${lpName}`;
}

function formatConstraintSense(sense: LpConstraint['sense']): string {
  if (sense === 'eq') {
    return '=';
  }
  if (sense === 'lte') {
    return '<=';
  }
  return '>=';
}

function formatVariableBound(
  lpName: string,
  lowerBound: number,
  upperBound: number | undefined,
): string {
  if (upperBound !== undefined && Math.abs(upperBound - lowerBound) <= EPSILON) {
    return `${lpName} = ${formatNumber(lowerBound)}`;
  }
  if (upperBound !== undefined) {
    return `${formatNumber(lowerBound)} <= ${lpName} <= ${formatNumber(upperBound)}`;
  }
  return `${lpName} >= ${formatNumber(lowerBound)}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot serialize non-finite LP number ${value}`);
  }
  const normalizedValue = cleanNumber(value);
  if (Number.isInteger(normalizedValue)) {
    return normalizedValue.toString();
  }
  return normalizedValue.toPrecision(15).replace(/(?:\.0+|(\.\d+?)0+)(e|$)/, '$1$2');
}

function cleanNumber(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
