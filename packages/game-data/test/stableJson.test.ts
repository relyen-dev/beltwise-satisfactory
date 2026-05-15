import { describe, expect, it } from 'vitest';
import { stableStringify } from '@beltwise/game-data';

describe('stableStringify', () => {
  it('sorts object keys recursively for clean generated data diffs', () => {
    expect(stableStringify({ z: 1, a: { d: 4, b: 2 } })).toBe(
      '{\n  "a": {\n    "b": 2,\n    "d": 4\n  },\n  "z": 1\n}\n',
    );
  });
});
