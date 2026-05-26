import { describe, expect, it } from 'vitest';
import { isApplicationUpdateError } from './application-update-error';

describe('isApplicationUpdateError', () => {
  it('recognizes dynamic import failures from current browsers', () => {
    expect(
      isApplicationUpdateError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://beltwise.test/chunk-ABCD1234.js',
        ),
      ),
    ).toBe(true);

    expect(isApplicationUpdateError(new TypeError('error loading dynamically imported module'))).toBe(
      true,
    );

    expect(isApplicationUpdateError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('recognizes chunk load failures wrapped by router or promise events', () => {
    const chunkError = {
      name: 'ChunkLoadError',
      message: 'Loading chunk 527 failed.',
    };

    expect(isApplicationUpdateError({ error: chunkError })).toBe(true);
    expect(isApplicationUpdateError({ reason: chunkError })).toBe(true);
  });

  it('recognizes failed script events that include the missing script source', () => {
    expect(
      isApplicationUpdateError({
        type: 'error',
        target: {
          tagName: 'SCRIPT',
          src: 'https://beltwise.test/chunk-Q2W3E4.js',
        },
      }),
    ).toBe(true);
  });

  it('recognizes failed script events without adding null field text', () => {
    expect(
      isApplicationUpdateError({
        target: {
          src: 'https://beltwise.test/chunk-Q2W3E4.js',
        },
      }),
    ).toBe(true);
  });

  it('ignores unrelated runtime errors', () => {
    expect(isApplicationUpdateError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isApplicationUpdateError({ message: 'Dataset request failed with 404' })).toBe(false);
  });
});
