import {
  Graph,
  layout as applyDagreLayout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel
} from '@dagrejs/dagre';
import type { Point, Size } from './model';
import type { GraphLayoutState } from './plan';
import type { ProductionGraph, ProductionGraphEdge, ProductionGraphNode } from './graphModel';

export interface GraphRendererModel {
  nodes: GraphRendererNode[];
  edges: GraphRendererEdge[];
}

export interface GraphRendererNode {
  id: string;
  kind: 'resource' | 'externalInput' | 'recipe' | 'output' | 'byproduct';
  position: Point;
  size?: Size;
  data: ProductionGraphNode;
}

export interface GraphRendererEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  data: ProductionGraphEdge;
}

const DEFAULT_NODE_SIZE: Size = { width: 220, height: 104 };
const GRAPH_LAYOUT_MARGIN = 48;
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
  const defaultPositions = defaultPositionsForGraph(graph);

  const nodes = graph.nodes.map((node) => {
    const position = defaultPositions[node.id] ?? {
      x: GRAPH_LAYOUT_MARGIN,
      y: GRAPH_LAYOUT_MARGIN
    };

    return {
      id: node.id,
      kind: node.kind,
      position,
      size: DEFAULT_NODE_SIZE,
      data: node
    };
  });

  return {
    nodes,
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      data: edge
    }))
  };
}

export function applyGraphLayout(
  model: GraphRendererModel,
  layoutState: GraphLayoutState,
): GraphRendererModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      position: layoutState.nodePositions[node.id] ?? node.position
    }))
  };
}

function defaultPositionsForGraph(graph: ProductionGraph): Record<string, Point> {
  if (graph.nodes.length === 0) {
    return {};
  }

  const layoutGraph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({
    directed: true
  });
  layoutGraph.setGraph({
    rankdir: 'LR',
    marginx: GRAPH_LAYOUT_MARGIN,
    marginy: GRAPH_LAYOUT_MARGIN,
    nodesep: GRAPH_LAYOUT_NODE_SEPARATION,
    ranksep: GRAPH_LAYOUT_RANK_SEPARATION,
    edgesep: GRAPH_LAYOUT_EDGE_SEPARATION,
    ranker: 'longest-path'
  });
  layoutGraph.setDefaultEdgeLabel(() => ({
    minlen: 1,
    weight: 1
  }));

  for (const node of graph.nodes) {
    layoutGraph.setNode(node.id, {
      width: DEFAULT_NODE_SIZE.width,
      height: DEFAULT_NODE_SIZE.height
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
          ? layoutNode.x - DEFAULT_NODE_SIZE.width / 2
          : GRAPH_LAYOUT_MARGIN;
      const y =
        typeof layoutNode.y === 'number'
          ? layoutNode.y - DEFAULT_NODE_SIZE.height / 2
          : GRAPH_LAYOUT_MARGIN;

      return [node.id, { x: Math.round(x), y: Math.round(y) }];
    }),
  );
}

function edgeLayoutConfig(edge: ProductionGraphEdge): { minlen: number; weight: number } {
  return {
    minlen: 1,
    weight: edge.amountPerMinute > 0 ? Math.max(1, Math.log10(edge.amountPerMinute + 1)) : 1
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
