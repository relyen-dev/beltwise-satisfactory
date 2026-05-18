import type { Point, Size } from './model';
import type { GraphLayoutState } from './plan';
import type { ProductionGraph, ProductionGraphEdge, ProductionGraphNode } from './graphModel';

export interface GraphPresentationModel {
  nodes: GraphPresentationNode[];
  edges: GraphPresentationEdge[];
}

export interface GraphPresentationNode {
  id: string;
  kind: 'resource' | 'externalInput' | 'recipe' | 'output' | 'byproduct';
  position: Point;
  size?: Size;
  data: ProductionGraphNode;
}

export interface GraphPresentationEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  data: ProductionGraphEdge;
}

export type GraphRendererModel = GraphPresentationModel;
export type GraphRendererNode = GraphPresentationNode;
export type GraphRendererEdge = GraphPresentationEdge;

export const DEFAULT_GRAPH_NODE_SIZE: Size = { width: 220, height: 104 };
export const DEFAULT_GRAPH_NODE_POSITION: Point = { x: 48, y: 48 };

export function toGraphPresentationModel(
  graph: ProductionGraph,
  nodePositions: Readonly<Record<string, Point>> = {},
): GraphPresentationModel {
  return {
    nodes: graph.nodes.map((node) => {
      const position = nodePositions[node.id] ?? DEFAULT_GRAPH_NODE_POSITION;

      return {
        id: node.id,
        kind: node.kind,
        position: { ...position },
        size: { ...DEFAULT_GRAPH_NODE_SIZE },
        data: node,
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      data: edge,
    })),
  };
}

export function applyGraphLayout(
  model: GraphPresentationModel,
  layoutState: GraphLayoutState,
): GraphPresentationModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      position: layoutState.nodePositions[node.id] ?? node.position,
    })),
  };
}
