import { describe, expect, it } from 'vitest';
import {
  buildDirectFocusScope,
  formatTargetAmountInputValue,
  isEditableOutputTargetNode,
  isFixedOutputTargetNode,
  normalizeTargetAmount,
  parseTargetAmount,
  prepareTargetAmountEdit,
  shouldShowTargetAmountInputForNode,
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

  it('identifies editable fixed output targets', () => {
    const node = targetNode();

    expect(isFixedOutputTargetNode(node)).toBe(true);
    expect(isEditableOutputTargetNode(node, false)).toBe(true);
    expect(shouldShowTargetAmountInputForNode(node, node.id, false)).toBe(true);
    expect(shouldShowTargetAmountInputForNode(node, null, false)).toBe(false);
    expect(isEditableOutputTargetNode(node, true)).toBe(false);
    expect(isFixedOutputTargetNode({ ...node, kind: 'byproduct' })).toBe(false);
    expect(
      isEditableOutputTargetNode(
        {
          ...node,
          data: { ...node.data, targetId: undefined },
        },
        false,
      ),
    ).toBe(false);
  });

  it('prepares target amount edits with normalized input and optional change', () => {
    expect(prepareTargetAmountEdit(targetNode(), '42.50', false)).toEqual({
      inputValue: '42.5',
      change: { targetId: 'target-plate', amountPerMinute: 42.5 },
    });

    expect(prepareTargetAmountEdit(targetNode(), '25.00', false)).toEqual({
      inputValue: '25',
      change: null,
    });

    expect(prepareTargetAmountEdit(targetNode(), '42', true)).toBeNull();
    expect(
      prepareTargetAmountEdit(
        {
          ...targetNode(),
          data: { ...targetNode().data, targetId: undefined },
        },
        '42',
        false,
      ),
    ).toBeNull();
  });
});

function targetNode(): {
  id: string;
  kind: 'output';
  data: {
    amountPerMinute: number;
    targetId: string;
    targetMode: 'fixed';
  };
} {
  return {
    id: 'output:target-plate',
    kind: 'output',
    data: {
      amountPerMinute: 25,
      targetId: 'target-plate',
      targetMode: 'fixed',
    },
  };
}
