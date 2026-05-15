import type { ProductionPlanResult } from '@beltwise/planner-core';
import type highsLoader from 'highs';
import type {
  LinearSolverAdapter,
  LinearSolverResult,
  ProductionSolverAdapter,
} from './SolverAdapter';
import {
  buildProductionLpModel,
  type LpConstraint,
  type LpObjective,
  type ProductionLpModel,
  type ProductionObjectiveStage,
  type ProductionPlanInput,
} from './lpModel';
import { buildProductionPlanResultFromSolution } from './productionResultMapping';

const EPSILON = 0.000000001;
const LEXICOGRAPHIC_ABSOLUTE_TOLERANCE = 0.0000000001;
const LEXICOGRAPHIC_RELATIVE_TOLERANCE = 0.0000000001;
const LEXICOGRAPHIC_MAX_RELAXED_TOLERANCE = 0.000001;
const RAW_INPUT_PROFILE_TOLERANCE_PER_MINUTE = 0.000001;
export const DEFAULT_HIGHS_SCRIPT_ASSET_PATH = '/assets/highs/highs.js';
export const DEFAULT_HIGHS_WASM_ASSET_PATH = '/assets/highs/highs.wasm';
const HIGHS_PRETTY_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolutionPretty","number",["number","string"]);';
const HIGHS_RAW_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolution","number",["number","string"]);';

type HighsInstance = Awaited<ReturnType<typeof highsLoader>>;
type HighsSolveOptions = NonNullable<Parameters<HighsInstance['solve']>[1]>;
type HighsLoader = (options?: HighsLoaderOptions) => Promise<HighsInstance>;
type HighsLoaderOptions = Readonly<{
  locateFile?: (file: string) => string;
}>;
type NodeRequire = {
  (id: string): unknown;
  resolve(id: string): string;
};
type NodeModuleApi = {
  createRequire(path: string): NodeRequire;
};
type NodePathApi = {
  dirname(path: string): string;
};
type NodeFsPromisesApi = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
};
type NodeVmApi = {
  runInNewContext(
    source: string,
    context: Record<string, unknown>,
    options: { filename: string },
  ): unknown;
};

declare global {
  interface Window {
    BeltwiseHighsLoader?: HighsLoader;
    Module?: unknown;
  }
}

export interface HighsLinearSolverAdapterOptions {
  locateFile?: (file: string) => string;
  solveOptions?: HighsSolveOptions;
}

export interface HighsLpSerialization {
  lpText: string;
  lpNameByVariableName: Record<string, string>;
  variableNameByLpName: Record<string, string>;
}

interface LexicographicLock {
  stage: ProductionObjectiveStage;
  stageIndex: number;
  variables: Record<string, number>;
  objectiveValue: number;
  tolerance: number;
}

const DEFAULT_HIGHS_SOLVE_OPTIONS: HighsSolveOptions = {
  presolve: 'on',
  solver: 'simplex',
  primal_feasibility_tolerance: 0.000000001,
  dual_feasibility_tolerance: 0.000000001,
};

export class HighsLinearSolverAdapter implements LinearSolverAdapter {
  public readonly id = 'highs-linear-solver';

  private readonly highsPromise: Promise<HighsInstance>;
  private readonly solveOptions: HighsSolveOptions;

  public constructor(options: HighsLinearSolverAdapterOptions = {}) {
    this.highsPromise = loadHighs(defaultHighsLoaderOptions(options.locateFile));
    this.solveOptions = options.solveOptions ?? DEFAULT_HIGHS_SOLVE_OPTIONS;
  }

  public async solve(model: ProductionLpModel): Promise<LinearSolverResult> {
    try {
      const highs = await this.highsPromise;
      const serialized = serializeProductionLpModelToHighsLp(model);
      const solution = highs.solve(serialized.lpText, this.solveOptions);
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
        objectiveValue: cleanNumber(solution.ObjectiveValue),
        variables: extractVariableValues(model, serialized, solution.Columns),
      };
    } catch (error: unknown) {
      return {
        status: 'error',
        variables: {},
        message: error instanceof Error ? error.message : 'HiGHS solve failed.',
      };
    }
  }
}

export class HighsProductionSolverAdapter implements ProductionSolverAdapter {
  public readonly id = 'highs-production-solver';

  public constructor(
    private readonly linearSolver: LinearSolverAdapter = new HighsLinearSolverAdapter(),
  ) {}

  public async solve(input: ProductionPlanInput): Promise<ProductionPlanResult> {
    const model = buildProductionLpModel(input);
    const result = await solveLexicographicProductionLp(model, this.linearSolver);
    return buildProductionPlanResultFromSolution(input, model, result);
  }
}

export async function solveLexicographicProductionLp(
  model: ProductionLpModel,
  linearSolver: LinearSolverAdapter = new HighsLinearSolverAdapter(),
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

function defaultHighsLoaderOptions(
  locateFile: ((file: string) => string) | undefined,
): HighsLoaderOptions | undefined {
  if (locateFile) {
    return { locateFile };
  }
  if (typeof window === 'undefined') {
    return undefined;
  }
  return {
    locateFile: (file) => (file === 'highs.wasm' ? DEFAULT_HIGHS_WASM_ASSET_PATH : file),
  };
}

async function loadHighs(options: HighsLoaderOptions | undefined): Promise<HighsInstance> {
  const loader = await loadHighsLoader();
  return loader(options);
}

async function loadHighsLoader(): Promise<HighsLoader> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return loadBrowserHighsLoader();
  }

  return loadNodeHighsLoader();
}

let browserHighsLoaderPromise: Promise<HighsLoader> | undefined;
let nodeHighsLoaderPromise: Promise<HighsLoader> | undefined;

async function loadNodeHighsLoader(): Promise<HighsLoader> {
  nodeHighsLoaderPromise ??= (async () => {
    const modulePackage = 'node:module';
    const pathPackage = 'node:path';
    const fsPromisesPackage = 'node:fs/promises';
    const vmPackage = 'node:vm';
    const { createRequire } = (await import(modulePackage)) as unknown as NodeModuleApi;
    const { dirname } = (await import(pathPackage)) as unknown as NodePathApi;
    const { readFile } = (await import(fsPromisesPackage)) as unknown as NodeFsPromisesApi;
    const { runInNewContext } = (await import(vmPackage)) as unknown as NodeVmApi;
    const nodeRequire = createRequire(import.meta.url);
    const sourcePath = nodeRequire.resolve('highs');
    const source = patchHighsSourceForRawSolution(await readFile(sourcePath, 'utf8'));
    const commonJsModule: { exports: unknown } = { exports: {} };
    const globalRecord = globalThis as Record<string, unknown>;

    runInNewContext(
      source,
      {
        module: commonJsModule,
        exports: commonJsModule.exports,
        require: nodeRequire,
        __dirname: dirname(sourcePath),
        __filename: sourcePath,
        console,
        process: globalRecord['process'],
        Buffer: globalRecord['Buffer'],
        URL,
        WebAssembly,
        TextDecoder,
        Uint8Array,
        Int8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        ArrayBuffer,
        Promise,
        setTimeout,
        clearTimeout,
        performance,
        crypto,
      },
      { filename: sourcePath },
    );

    return highsLoaderFromUnknown(commonJsModule.exports);
  })();

  return nodeHighsLoaderPromise;
}

async function loadBrowserHighsLoader(): Promise<HighsLoader> {
  if (window.BeltwiseHighsLoader) {
    return window.BeltwiseHighsLoader;
  }

  browserHighsLoaderPromise ??= new Promise<HighsLoader>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    let scriptUrl = '';
    script.onload = () => {
      try {
        if (scriptUrl) {
          URL.revokeObjectURL(scriptUrl);
        }
        const loader = highsLoaderFromUnknown(window.Module);
        window.BeltwiseHighsLoader = loader;
        resolve(loader);
      } catch (error: unknown) {
        reject(error);
      }
    };
    script.onerror = () => {
      if (scriptUrl) {
        URL.revokeObjectURL(scriptUrl);
      }
      reject(new Error(`Failed to load HiGHS script from ${DEFAULT_HIGHS_SCRIPT_ASSET_PATH}`));
    };
    fetch(DEFAULT_HIGHS_SCRIPT_ASSET_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HiGHS script request returned ${response.status}.`);
        }
        return response.text();
      })
      .then((source) => {
        scriptUrl = URL.createObjectURL(
          new Blob([patchHighsSourceForRawSolution(source)], { type: 'text/javascript' }),
        );
        script.src = scriptUrl;
        document.head.append(script);
      })
      .catch((error: unknown) => {
        reject(error);
      });
  });

  return browserHighsLoaderPromise;
}

function patchHighsSourceForRawSolution(source: string): string {
  if (!source.includes(HIGHS_PRETTY_SOLUTION_WRITER)) {
    throw new Error('Unable to patch HiGHS solution writer.');
  }

  // highs-js parses human-readable "pretty" output, which truncates column values.
  // Keep the upstream wrapper, but swap in HiGHS' raw solution writer and parser.
  const writerPatchedSource = source.replace(
    HIGHS_PRETTY_SOLUTION_WRITER,
    HIGHS_RAW_SOLUTION_WRITER,
  );
  const parserStart = writerPatchedSource.indexOf('function fc(a){');
  const parserEnd = writerPatchedSource.indexOf('function ic(a,b){', parserStart);
  if (parserStart < 0 || parserEnd < 0) {
    throw new Error('Unable to patch HiGHS solution parser.');
  }

  return `${writerPatchedSource.slice(0, parserStart)}${HIGHS_RAW_SOLUTION_PARSER_SOURCE}${writerPatchedSource.slice(parserEnd)}`;
}

const HIGHS_RAW_SOLUTION_PARSER_SOURCE = String.raw`
function fc(a){
const b={Status:a,Columns:{},Rows:[],ObjectiveValue:NaN};
const c=q.find(d=>d.startsWith("Objective "));
if(c)b.ObjectiveValue=Z(c.slice("Objective ".length).trim());
const d=(e,f)=>{
const h=q.findIndex((n,r)=>r>=e&&n.startsWith("# Columns "));
if(h<0)return;
const n=Number((q[h].match(/^# Columns\s+(\d+)/)||[])[1]||0);
for(let r=0;r<n;r++){
const l=(q[h+1+r]||"").trim().match(/^(\S+)\s+(.+)$/);
if(!l)continue;
const p=l[1],t=Z(l[2]);
const S=b.Columns[p]||(b.Columns[p]={Index:r,Status:"",Lower:-Infinity,Upper:Infinity,Type:"Continuous",Primal:0,Dual:0,Name:p});
S[f]=t;
}
const r=h+1+n;
const l=Number(((q[r]||"").match(/^# Rows\s+(\d+)/)||[])[1]||0);
for(let p=0;p<l;p++){
const t=(q[r+1+p]||"").trim().match(/^(\S+)\s+(.+)$/);
if(!t)continue;
const S=t[1],ma=Z(t[2]);
if(!b.Rows[p])b.Rows[p]={Index:p,Name:S,Status:"",Lower:-Infinity,Upper:Infinity,Primal:0,Dual:0};
b.Rows[p].Name=S;
b.Rows[p][f]=ma;
}
};
const e=q.indexOf("# Primal solution values");
if(e<0)throw Error("Unable to parse raw solution. Missing primal solution values.");
d(e,"Primal");
const f=q.indexOf("# Dual solution values");
if(f>=0)d(f,"Dual");
return b;
}
`;

function highsLoaderFromUnknown(value: unknown): HighsLoader {
  if (typeof value === 'function') {
    return value as HighsLoader;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'default' in value &&
    typeof value.default === 'function'
  ) {
    return value.default as HighsLoader;
  }
  throw new Error('Unable to load the HiGHS solver runtime.');
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
  return Object.values(model.metadata.rawInputVariableByItemId).map(
    (variableName, variableIndex) => ({
      name: `lex:${lock.stage.name}:${lock.stageIndex}:raw-input:${variableIndex}`,
      coefficients: { [variableName]: 1 },
      sense: 'lte',
      rhs: cleanNumber(
        (lock.variables[variableName] ?? 0) + RAW_INPUT_PROFILE_TOLERANCE_PER_MINUTE,
      ),
    }),
  );
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
