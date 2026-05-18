const HIGHS_PRETTY_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolutionPretty","number",["number","string"]);';
const HIGHS_RAW_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolution","number",["number","string"]);';
const HIGHS_PRETTY_SOLUTION_PARSER_START = 'function fc(a){';
const HIGHS_NEXT_WRAPPER_FUNCTION_START = 'function ic(a,b){';

export function patchHighsSourceForRawSolution(source: string): string {
  assertHighsWrapperPatchCanApply(source);

  // highs-js parses human-readable "pretty" output, which truncates column values.
  // Keep the upstream wrapper, but swap in HiGHS' raw solution writer and parser.
  const writerPatchedSource = source.replace(
    HIGHS_PRETTY_SOLUTION_WRITER,
    HIGHS_RAW_SOLUTION_WRITER,
  );
  const parserStart = writerPatchedSource.indexOf(HIGHS_PRETTY_SOLUTION_PARSER_START);
  const parserEnd = writerPatchedSource.indexOf(
    HIGHS_NEXT_WRAPPER_FUNCTION_START,
    parserStart,
  );

  return `${writerPatchedSource.slice(0, parserStart)}${HIGHS_RAW_SOLUTION_PARSER_SOURCE}${writerPatchedSource.slice(parserEnd)}`;
}

export function assertHighsWrapperPatchCanApply(source: string): void {
  if (!source.includes(HIGHS_PRETTY_SOLUTION_WRITER)) {
    throw new Error('Unable to patch HiGHS solution writer.');
  }

  const parserStart = source.indexOf(HIGHS_PRETTY_SOLUTION_PARSER_START);
  const parserEnd = source.indexOf(HIGHS_NEXT_WRAPPER_FUNCTION_START, parserStart);
  if (parserStart < 0 || parserEnd < 0) {
    throw new Error('Unable to patch HiGHS solution parser.');
  }
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
