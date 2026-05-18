import { describe, expect, it, vi } from 'vitest';
import {
  clearPlannerShareCodeFromLocation,
  createPlannerShareUrl,
  decodePlannerShareCode,
  encodePlannerShareCode,
  MAX_PLANNER_SHARE_CODE_CHARACTERS,
  MAX_PLANNER_SHARE_JSON_BYTES,
  readPlannerShareCodeFromLocation,
} from './planner-share-codec';

describe('planner share code helpers', () => {
  it('round-trips payloads through compressed share codes', async () => {
    const payload = {
      k: 'bw.p',
      v: 1,
      d: { id: 'satisfactory-tiny-fixture', gameVersionLabel: 'fixture' },
      p: { n: 'Iron floor', t: [{ id: 'target-a', i: 'Desc_IronPlate_C', m: 'f', a: 20, s: 0 }] },
    };

    const code = await encodePlannerShareCode(payload);

    expect(code).toMatch(/^bw1\./);
    expect(await decodePlannerShareCode(code)).toEqual(payload);
  });

  it('parses share codes from full URLs, query strings, and location hashes', async () => {
    const payload = {
      k: 'bw.p',
      v: 1,
      d: { id: 'dataset', gameVersionLabel: 'fixture' },
      p: { n: 'A' },
    };
    const code = await encodePlannerShareCode(payload);
    const hashUrl = createPlannerShareUrl(
      code,
      'https://beltwise.test/planner?mode=local#panel=plan',
    );
    const queryUrl = `https://beltwise.test/planner?plan=${encodeURIComponent(code)}`;

    expect(hashUrl).toBe(`https://beltwise.test/planner?mode=local#panel=plan&plan=${code}`);
    expect(await decodePlannerShareCode(hashUrl)).toEqual(payload);
    expect(await decodePlannerShareCode(queryUrl)).toEqual(payload);
    expect(
      readPlannerShareCodeFromLocation({
        hash: `#panel=plan&plan=${code}`,
      } as Location),
    ).toBe(code);
  });

  it('clears the plan fragment while preserving other hash parameters', () => {
    const history = {
      state: { from: 'test' },
      replaceState: vi.fn(),
    };

    clearPlannerShareCodeFromLocation(
      {
        href: 'https://beltwise.test/planner#panel=plan&plan=bw1.example',
        hash: '#panel=plan&plan=bw1.example',
      } as Location,
      history as unknown as History,
    );

    expect(history.replaceState).toHaveBeenCalledWith(
      { from: 'test' },
      '',
      'https://beltwise.test/planner#panel=plan',
    );
  });

  it('rejects oversized share codes before decoding', async () => {
    await expect(
      decodePlannerShareCode(`bw1.${'a'.repeat(MAX_PLANNER_SHARE_CODE_CHARACTERS + 1)}`),
    ).rejects.toThrow('That Beltwise plan code is too large.');
  });

  it('rejects compressed links with oversized decoded JSON payloads', async () => {
    const code = await encodePlannerShareCode({
      k: 'bw.p',
      v: 1,
      d: { id: 'dataset', gameVersionLabel: 'fixture' },
      p: { n: 'A', no: 'x'.repeat(MAX_PLANNER_SHARE_JSON_BYTES + 1) },
    });

    await expect(decodePlannerShareCode(code)).rejects.toThrow(
      'That Beltwise plan code is too large.',
    );
  });
});
