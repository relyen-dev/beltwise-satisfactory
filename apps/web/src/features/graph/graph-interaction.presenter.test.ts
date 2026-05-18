import { describe, expect, it } from 'vitest';
import {
  buildDirectFocusScope,
  formatTargetAmountInputValue,
  normalizeTargetAmount,
  parseTargetAmount,
} from './graph-interaction.presenter';

describe('graph interaction presenter', () => {
  it('builds focus scope from the selected node and directly connected edges', () => {
    const scope = buildDirectFocusScope(
      {
        nodes: [{ id: 'input' }, { id: 'recipe' }, { id: 'output' }, { id: 'unrelated' }],
        edges: [
          { id: 'input-recipe', sourceNodeId: 'input', targetNodeId: 'recipe' },
          { id: 'recipe-output', sourceNodeId: 'recipe', targetNodeId: 'output' },
          { id: 'input-output', sourceNodeId: 'input', targetNodeId: 'output' },
        ],
      },
      'recipe',
    );

    expect([...scope.nodeIds].sort()).toEqual(['input', 'output', 'recipe']);
    expect([...scope.edgeIds].sort()).toEqual(['input-recipe', 'recipe-output']);
  });

  it('returns an empty focus scope when selected node is not in the model', () => {
    const scope = buildDirectFocusScope(
      {
        nodes: [{ id: 'input' }],
        edges: [{ id: 'input-output', sourceNodeId: 'input', targetNodeId: 'output' }],
      },
      'missing',
    );

    expect(scope.nodeIds.size).toBe(0);
    expect(scope.edgeIds.size).toBe(0);
  });

  it('normalizes target amounts for parsing and input display', () => {
    expect(parseTargetAmount('1,200.5')).toBe(1200.5);
    expect(parseTargetAmount('-4')).toBe(0);
    expect(parseTargetAmount('not a number')).toBe(0);
    expect(normalizeTargetAmount(Number.NaN)).toBe(0);
    expect(normalizeTargetAmount(undefined)).toBe(0);
    expect(formatTargetAmountInputValue(42.5)).toBe('42.5');
  });
});
