import type { GraphDisplaySettings, GraphRendererNode } from '@beltwise/planner-core';
import { formatMachineCount, formatRate } from '../graph-display-formatting';
import type { BeltwiseFoblexEdgeLabelLines } from './graph-transport-display';

export interface BeltwiseFoblexNodeTooltip {
  title: string;
  stats: string[];
  inputs: BeltwiseFoblexEdgeLabelLines[];
  outputs: BeltwiseFoblexEdgeLabelLines[];
  loopbacks: BeltwiseFoblexEdgeLabelLines[];
}

interface GraphTooltipEdge {
  sourceNodeId: string;
  targetNodeId: string;
  data: {
    itemId: string;
    amountPerMinute: number;
  };
  labelLines: BeltwiseFoblexEdgeLabelLines;
}

export function buildNodeTooltip(
  node: GraphRendererNode,
  edges: readonly GraphTooltipEdge[],
  displaySettings: Pick<GraphDisplaySettings, 'rateDecimalPlaces'>,
): BeltwiseFoblexNodeTooltip | null {
  const inputs = edges
    .filter((edge) => edge.targetNodeId === node.id && edge.sourceNodeId !== node.id)
    .map((edge) => edge.labelLines);
  const outgoingEdges = edges.filter(
    (edge) => edge.sourceNodeId === node.id && edge.targetNodeId !== node.id,
  );
  const outputs = outgoingEdges.map((edge) =>
    outputTooltipLine(edge, outgoingEdges, node.data.machineCount, displaySettings),
  );
  const loopbacks = edges
    .filter((edge) => edge.sourceNodeId === node.id && edge.targetNodeId === node.id)
    .map((edge) => edge.labelLines);
  const stats = nodeTooltipStats(node, displaySettings);

  if (
    stats.length === 0 &&
    inputs.length === 0 &&
    outputs.length === 0 &&
    loopbacks.length === 0
  ) {
    return null;
  }

  return {
    title: node.data.label,
    stats,
    inputs,
    outputs,
    loopbacks,
  };
}

function outputTooltipLine(
  edge: GraphTooltipEdge,
  outgoingEdges: readonly GraphTooltipEdge[],
  nodeMachineCount: number | undefined,
  displaySettings: Pick<GraphDisplaySettings, 'rateDecimalPlaces'>,
): BeltwiseFoblexEdgeLabelLines {
  const splitItemTotal = splitItemOutputTotal(edge, outgoingEdges);
  if (!nodeMachineCount || splitItemTotal === null) {
    return edge.labelLines;
  }

  return {
    ...edge.labelLines,
    machineCount: formatMachineCount(
      (nodeMachineCount * edge.data.amountPerMinute) / splitItemTotal,
      displaySettings.rateDecimalPlaces,
    ),
  };
}

function splitItemOutputTotal(
  edge: GraphTooltipEdge,
  outgoingEdges: readonly GraphTooltipEdge[],
): number | null {
  const sameItemOutputs = outgoingEdges.filter(
    (candidate) =>
      candidate.data.itemId === edge.data.itemId && candidate.targetNodeId !== edge.targetNodeId,
  );
  if (sameItemOutputs.length === 0) {
    return null;
  }

  return sameItemOutputs.reduce(
    (sum, candidate) => sum + candidate.data.amountPerMinute,
    edge.data.amountPerMinute,
  );
}

function nodeTooltipStats(
  node: GraphRendererNode,
  displaySettings: Pick<GraphDisplaySettings, 'rateDecimalPlaces'>,
): string[] {
  if (node.data.machineDisplayName) {
    return [
      `${formatMachineCount(node.data.machineCount, displaySettings.rateDecimalPlaces)}x ${node.data.machineDisplayName}`,
      `Recipe cycles ${formatRate(node.data.amountPerMinute, displaySettings.rateDecimalPlaces)}/min`,
    ];
  }

  return node.data.subtitle ? [node.data.subtitle] : [];
}
