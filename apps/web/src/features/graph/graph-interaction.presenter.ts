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

export function parseTargetAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function formatTargetAmountInputValue(amountPerMinute: number | undefined): string {
  return normalizeTargetAmount(amountPerMinute).toString();
}

export function normalizeTargetAmount(amountPerMinute: number | undefined): number {
  return amountPerMinute !== undefined && Number.isFinite(amountPerMinute)
    ? Math.max(0, amountPerMinute)
    : 0;
}
