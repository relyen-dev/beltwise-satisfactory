import type { ProductionPlanResult } from '@beltwise/planner-core';
import type highsLoader from 'highs';
import type {
  LinearSolverAdapter,
  LinearSolverResult,
  ProductionSolverAdapter,
} from './SolverAdapter';
import {
  buildProductionLpModel,
  type ProductionLpModel,
  type ProductionPlanInput,
} from './lpModel';
import { serializeProductionLpModelToHighsLp } from './highsLpSerialization';
import { mapHighsSolutionToLinearResult } from './highsSolutionMapping';
import { solveLexicographicProductionLpWithSolver } from './lexicographicProductionLpCore';
import { buildProductionPlanResultFromSolution } from './productionResultMapping';

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
      return mapHighsSolutionToLinearResult(model, serialized, solution);
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
    const result = await solveLexicographicProductionLpWithSolver(model, this.linearSolver);
    return buildProductionPlanResultFromSolution(input, model, result);
  }
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
