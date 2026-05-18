import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  assertHighsWrapperPatchCanApply,
  patchHighsSourceForRawSolution,
} from '../src/highsWrapperPatch';

const require = createRequire(import.meta.url);
const HIGHS_PRETTY_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolutionPretty","number",["number","string"]);';
const HIGHS_RAW_SOLUTION_WRITER =
  'g.sa=g.cwrap("Highs_writeSolution","number",["number","string"]);';

function installedHighsSource(): string {
  return readFileSync(require.resolve('highs'), 'utf8');
}

describe('HiGHS wrapper raw solution patch canary', () => {
  it('can still patch the installed highs wrapper shape', () => {
    const source = installedHighsSource();

    expect(() => assertHighsWrapperPatchCanApply(source)).not.toThrow();

    const patchedSource = patchHighsSourceForRawSolution(source);

    expect(patchedSource).toContain(HIGHS_RAW_SOLUTION_WRITER);
    expect(patchedSource).not.toContain(HIGHS_PRETTY_SOLUTION_WRITER);
    expect(patchedSource).toContain(
      'Unable to parse raw solution. Missing primal solution values.',
    );
  });

  it('fails loudly when the wrapper writer anchor changes', () => {
    const source = installedHighsSource().replace(
      HIGHS_PRETTY_SOLUTION_WRITER,
      'g.sa=g.cwrap("ChangedWriter","number",["number","string"]);',
    );

    expect(() => assertHighsWrapperPatchCanApply(source)).toThrow(
      'Unable to patch HiGHS solution writer.',
    );
  });

  it('fails loudly when the pretty parser anchor changes', () => {
    const source = installedHighsSource().replace('function fc(a){', 'function changedParser(a){');

    expect(() => assertHighsWrapperPatchCanApply(source)).toThrow(
      'Unable to patch HiGHS solution parser.',
    );
  });
});
