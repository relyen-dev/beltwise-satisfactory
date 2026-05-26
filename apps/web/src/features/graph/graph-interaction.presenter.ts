import type { ProductionGraphNode } from '@beltwise/planner-core';

export interface GraphFocusScope {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

export interface GraphFocusNode {
  id: string;
}

export interface GraphFocusEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface GraphFocusModel {
  nodes: readonly GraphFocusNode[];
  edges: readonly GraphFocusEdge[];
}

export interface GraphTargetAmountNode {
  id: string;
  kind: ProductionGraphNode['kind'];
  data: Pick<ProductionGraphNode, 'amountPerMinute' | 'targetId' | 'targetMode'>;
}

export interface GraphTargetAmountChange {
  targetId: string;
  amountPerMinute: number;
}

export interface GraphTargetAmountEdit {
  inputValue: string;
  change: GraphTargetAmountChange | null;
}

const TARGET_AMOUNT_INTEGER_TOLERANCE = 0.000001;

export function buildDirectFocusScope(
  flow: GraphFocusModel,
  selectedNodeId: string,
): GraphFocusScope {
  const selectedNode = flow.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return emptyGraphFocusScope();
  }

  const nodeIds = new Set<string>([selectedNode.id]);
  const edgeIds = new Set<string>();
  for (const edge of flow.edges) {
    if (edge.sourceNodeId !== selectedNodeId && edge.targetNodeId !== selectedNodeId) {
      continue;
    }
    edgeIds.add(edge.id);
    nodeIds.add(edge.sourceNodeId);
    nodeIds.add(edge.targetNodeId);
  }

  return { nodeIds, edgeIds };
}

export function emptyGraphFocusScope(): GraphFocusScope {
  return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
}

export function isFixedOutputTargetNode(node: GraphTargetAmountNode): boolean {
  return node.kind === 'output' && node.data.targetMode === 'fixed';
}

export function isEditableOutputTargetNode(
  node: GraphTargetAmountNode,
  targetEditingLocked: boolean,
): boolean {
  return isFixedOutputTargetNode(node) && node.data.targetId !== undefined && !targetEditingLocked;
}

export function shouldShowTargetAmountInputForNode(
  node: GraphTargetAmountNode,
  selectedNodeId: string | null,
  targetEditingLocked: boolean,
): boolean {
  return isEditableOutputTargetNode(node, targetEditingLocked) && selectedNodeId === node.id;
}

export function prepareTargetAmountEdit(
  node: GraphTargetAmountNode,
  value: string,
  targetEditingLocked: boolean,
): GraphTargetAmountEdit | null {
  if (!isEditableOutputTargetNode(node, targetEditingLocked)) {
    return null;
  }

  const targetId = node.data.targetId;
  if (!targetId) {
    return null;
  }

  const amountPerMinute = parseTargetAmount(value);
  const inputValue = formatTargetAmountInputValue(amountPerMinute);
  if (amountPerMinute === normalizeTargetAmount(node.data.amountPerMinute)) {
    return { inputValue, change: null };
  }

  return {
    inputValue,
    change: { targetId, amountPerMinute },
  };
}

export function parseTargetAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return normalizeTargetAmount(parsed);
}

export function formatTargetAmountInputValue(amountPerMinute: number | undefined): string {
  return normalizeTargetAmount(amountPerMinute).toString();
}

export function normalizeTargetAmount(amountPerMinute: number | undefined): number {
  if (amountPerMinute === undefined || !Number.isFinite(amountPerMinute)) {
    return 0;
  }

  const nonNegativeAmountPerMinute = Math.max(0, amountPerMinute);
  const nearestInteger = Math.round(nonNegativeAmountPerMinute);
  return Math.abs(nonNegativeAmountPerMinute - nearestInteger) < TARGET_AMOUNT_INTEGER_TOLERANCE
    ? nearestInteger
    : nonNegativeAmountPerMinute;
}
