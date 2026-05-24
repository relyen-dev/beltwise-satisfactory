import type { ProductionGraphNode, RateDecimalPlaces } from '@beltwise/planner-core';
import { formatDisplayDecimalValue } from './graph-display-formatting';
import type { GraphFocusScope } from './graph-interaction.presenter';

export interface GraphCompletionEdge {
  targetNodeId: string;
}

export interface GraphTooltipFlowLine {
  itemName: string;
  amountPerMinute: string;
  machineCount?: string;
}

export type GraphTooltipFlowSection = 'input' | 'output';

export function isGraphNodeSelected(nodeId: string, selectedNodeId: string | null): boolean {
  return selectedNodeId === nodeId;
}

export function isGraphNodeFocused(nodeId: string, focusScope: GraphFocusScope): boolean {
  return focusScope.nodeIds.has(nodeId);
}

export function isGraphNodeDimmed(
  nodeId: string,
  selectedNodeId: string | null,
  focusScope: GraphFocusScope,
): boolean {
  return selectedNodeId !== null && !isGraphNodeFocused(nodeId, focusScope);
}

export function isGraphNodeDone(nodeId: string, completedNodeIds: ReadonlySet<string>): boolean {
  return completedNodeIds.has(nodeId);
}

export function isGraphEdgeFocused(edgeId: string, focusScope: GraphFocusScope): boolean {
  return focusScope.edgeIds.has(edgeId);
}

export function isGraphEdgeDimmed(
  edgeId: string,
  selectedNodeId: string | null,
  focusScope: GraphFocusScope,
): boolean {
  return selectedNodeId !== null && !isGraphEdgeFocused(edgeId, focusScope);
}

export function isGraphEdgeDone(
  edge: GraphCompletionEdge,
  completedNodeIds: ReadonlySet<string>,
): boolean {
  return completedNodeIds.has(edge.targetNodeId);
}

export function graphNodeNote(nodeId: string, nodeNotes: Readonly<Record<string, string>>): string {
  return nodeNotes[nodeId] ?? '';
}

export function formatTargetAmountDisplayValue(
  amountPerMinute: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(amountPerMinute, decimalPlaces);
}

export function formatMachineCountDisplayValue(
  machineCount: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(machineCount, decimalPlaces);
}

export function formatGraphNodeKindDisplayValue(kind: ProductionGraphNode['kind']): string {
  switch (kind) {
    case 'resource':
      return 'resource';
    case 'externalInput':
      return 'external input';
    case 'assumedInput':
      return 'assumed input';
    case 'recipe':
      return 'recipe';
    case 'output':
      return 'output';
    case 'byproduct':
      return 'byproduct';
    case 'sink':
      return 'sink';
  }
}

export function graphTooltipStatKey(stat: string, index: number): string {
  return `stat:${index}:${stat}`;
}

export function graphTooltipFlowKey(
  flow: GraphTooltipFlowLine,
  section: GraphTooltipFlowSection,
  index: number,
): string {
  return `${section}:${index}:${flow.itemName}:${flow.amountPerMinute}:${flow.machineCount ?? ''}`;
}
