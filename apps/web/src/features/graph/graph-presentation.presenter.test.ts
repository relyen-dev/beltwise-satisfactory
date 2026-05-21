import { describe, expect, it } from 'vitest';
import {
  formatMachineCountDisplayValue,
  formatGraphNodeKindDisplayValue,
  formatTargetAmountDisplayValue,
  graphNodeNote,
  graphTooltipFlowKey,
  graphTooltipStatKey,
  isGraphEdgeDimmed,
  isGraphEdgeDone,
  isGraphEdgeFocused,
  isGraphNodeDimmed,
  isGraphNodeDone,
  isGraphNodeFocused,
  isGraphNodeSelected,
} from './graph-presentation.presenter';

describe('graph presentation presenter', () => {
  it('derives node focus, selection, dimming, and done state', () => {
    const focusScope = {
      nodeIds: new Set(['recipe', 'output']),
      edgeIds: new Set(['recipe-output']),
    };
    const completedNodeIds = new Set(['output']);

    expect(isGraphNodeSelected('recipe', 'recipe')).toBe(true);
    expect(isGraphNodeSelected('output', 'recipe')).toBe(false);
    expect(isGraphNodeFocused('output', focusScope)).toBe(true);
    expect(isGraphNodeDimmed('resource', 'recipe', focusScope)).toBe(true);
    expect(isGraphNodeDimmed('resource', null, focusScope)).toBe(false);
    expect(isGraphNodeDone('output', completedNodeIds)).toBe(true);
  });

  it('derives edge focus, dimming, and target-completion state', () => {
    const focusScope = {
      nodeIds: new Set(['recipe', 'output']),
      edgeIds: new Set(['recipe-output']),
    };
    const completedNodeIds = new Set(['output']);

    expect(isGraphEdgeFocused('recipe-output', focusScope)).toBe(true);
    expect(isGraphEdgeDimmed('resource-recipe', 'recipe', focusScope)).toBe(true);
    expect(isGraphEdgeDimmed('resource-recipe', null, focusScope)).toBe(false);
    expect(isGraphEdgeDone({ targetNodeId: 'output' }, completedNodeIds)).toBe(true);
  });

  it('formats node notes, target amounts, machine counts, and tooltip keys', () => {
    expect(graphNodeNote('recipe', { recipe: 'Build this first' })).toBe('Build this first');
    expect(graphNodeNote('missing', { recipe: 'Build this first' })).toBe('');
    expect(formatTargetAmountDisplayValue(42.5, 3)).toBe('42.5');
    expect(formatTargetAmountDisplayValue(undefined, 3)).toBe('0');
    expect(formatMachineCountDisplayValue(1.25, 2)).toBe('1.25');
    expect(formatGraphNodeKindDisplayValue('assumedInput')).toBe('assumed input');
    expect(graphTooltipStatKey('4x Constructor', 0)).toBe('stat:0:4x Constructor');
    expect(
      graphTooltipFlowKey(
        { itemName: 'Iron Plate', amountPerMinute: '30/min', machineCount: '1' },
        'output',
        2,
      ),
    ).toBe('output:2:Iron Plate:30/min:1');
  });
});
