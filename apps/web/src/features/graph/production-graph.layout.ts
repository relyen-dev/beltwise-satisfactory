import {
  Graph,
  layout as applyDagreLayout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';
import {
  applyGraphLayout,
  DEFAULT_GRAPH_NODE_POSITION,
  DEFAULT_GRAPH_NODE_SIZE,
  toGraphPresentationModel,
  type GraphLayoutState,
  type GraphRendererModel,
  type Point,
  type ProductionGraph,
  type ProductionGraphEdge,
} from '@beltwise/planner-core';

const GRAPH_LAYOUT_NODE_SEPARATION = 72;
const GRAPH_LAYOUT_RANK_SEPARATION = 148;
const GRAPH_LAYOUT_EDGE_SEPARATION = 32;

export function toGraphRendererModel(
  graph: ProductionGraph,
  layoutState: GraphLayoutState,
): GraphRendererModel {
  return applyGraphLayout(toDefaultGraphRendererModel(graph), layoutState);
}

export function toDefaultGraphRendererModel(graph: ProductionGraph): GraphRendererModel {
  return toGraphPresentationModel(graph, defaultPositionsForGraph(graph));
}

function defaultPositionsForGraph(graph: ProductionGraph): Record<string, Point> {
  if (graph.nodes.length === 0) {
    return {};
  }

  const layoutGraph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({
    directed: true,
  });
  layoutGraph.setGraph({
    rankdir: 'LR',
    marginx: DEFAULT_GRAPH_NODE_POSITION.x,
    marginy: DEFAULT_GRAPH_NODE_POSITION.y,
    nodesep: GRAPH_LAYOUT_NODE_SEPARATION,
    ranksep: GRAPH_LAYOUT_RANK_SEPARATION,
    edgesep: GRAPH_LAYOUT_EDGE_SEPARATION,
    ranker: 'longest-path',
  });
  layoutGraph.setDefaultEdgeLabel(() => ({
    minlen: 1,
    weight: 1,
  }));

  for (const node of graph.nodes) {
    layoutGraph.setNode(node.id, {
      width: DEFAULT_GRAPH_NODE_SIZE.width,
      height: DEFAULT_GRAPH_NODE_SIZE.height,
    });
  }

  const layoutAdjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.sourceNodeId === edge.targetNodeId || createsLayoutCycle(layoutAdjacency, edge)) {
      continue;
    }
    layoutGraph.setEdge(edge.sourceNodeId, edge.targetNodeId, edgeLayoutConfig(edge));
    addLayoutEdge(layoutAdjacency, edge);
  }

  applyDagreLayout(layoutGraph);

  return Object.fromEntries(
    graph.nodes.map((node) => {
      const layoutNode = layoutGraph.node(node.id);
      const x =
        typeof layoutNode.x === 'number'
          ? layoutNode.x - DEFAULT_GRAPH_NODE_SIZE.width / 2
          : DEFAULT_GRAPH_NODE_POSITION.x;
      const y =
        typeof layoutNode.y === 'number'
          ? layoutNode.y - DEFAULT_GRAPH_NODE_SIZE.height / 2
          : DEFAULT_GRAPH_NODE_POSITION.y;

      return [node.id, { x: Math.round(x), y: Math.round(y) }];
    }),
  );
}

function edgeLayoutConfig(edge: ProductionGraphEdge): { minlen: number; weight: number } {
  return {
    minlen: 1,
    weight: edge.amountPerMinute > 0 ? Math.max(1, Math.log10(edge.amountPerMinute + 1)) : 1,
  };
}

function createsLayoutCycle(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  edge: ProductionGraphEdge,
): boolean {
  return hasLayoutPath(edge.targetNodeId, edge.sourceNodeId, adjacency, new Set<string>());
}

function hasLayoutPath(
  currentNodeId: string,
  targetNodeId: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  visited: Set<string>,
): boolean {
  if (currentNodeId === targetNodeId) {
    return true;
  }
  if (visited.has(currentNodeId)) {
    return false;
  }
  visited.add(currentNodeId);

  for (const nextNodeId of adjacency.get(currentNodeId) ?? []) {
    if (hasLayoutPath(nextNodeId, targetNodeId, adjacency, visited)) {
      return true;
    }
  }

  return false;
}

function addLayoutEdge(adjacency: Map<string, Set<string>>, edge: ProductionGraphEdge): void {
  const targets = adjacency.get(edge.sourceNodeId) ?? new Set<string>();
  targets.add(edge.targetNodeId);
  adjacency.set(edge.sourceNodeId, targets);
}
