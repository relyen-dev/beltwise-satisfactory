import type { GameDataset, ItemId, RecipeId } from '@beltwise/game-data';
import type { ProductTarget, RateDecimalPlaces, SinkRule } from './plan';
import { isSinkableItem, sinkPointsPerMinute, surplusSinkRuleForItem } from './sinkRules';

export type ProductionPlanStatus = 'optimal' | 'infeasible' | 'unbounded' | 'error';

export interface ItemFlowEndpoint {
  kind: 'resource' | 'externalInput' | 'assumedInput' | 'recipe' | 'output' | 'byproduct' | 'sink';
  id: string;
}

export interface ItemFlow {
  itemId: ItemId;
  amountPerMinute: number;
  source: ItemFlowEndpoint;
  target: ItemFlowEndpoint;
}

export interface MachineUsage {
  recipeId: RecipeId;
  machineId: string;
  machineDisplayName: string;
  recipeDisplayName: string;
  recipeRatePerMinute: number;
  machineCount: number;
  powerMw: number;
}

export interface PlanWarning {
  code: string;
  message: string;
  itemId?: ItemId;
  recipeId?: RecipeId;
}

export interface ProductionPlanResult {
  status: ProductionPlanStatus;
  recipeRates: Record<RecipeId, number>;
  rawInputs: Record<ItemId, number>;
  externalInputs?: Record<ItemId, number>;
  assumedInputs?: Record<ItemId, number>;
  itemFlows: ItemFlow[];
  outputs: Record<ItemId, number>;
  surplus: Record<ItemId, number>;
  machineUsage: MachineUsage[];
  powerMw: number;
  warnings: PlanWarning[];
}

export function createEmptyProductionPlanResult(): ProductionPlanResult {
  return {
    status: 'optimal',
    recipeRates: {},
    rawInputs: {},
    externalInputs: {},
    assumedInputs: {},
    itemFlows: [],
    outputs: {},
    surplus: {},
    machineUsage: [],
    powerMw: 0,
    warnings: [],
  };
}

export interface ProductionGraph {
  nodes: ProductionGraphNode[];
  edges: ProductionGraphEdge[];
}

export interface ProductionGraphNode {
  id: string;
  kind: 'resource' | 'externalInput' | 'assumedInput' | 'recipe' | 'output' | 'byproduct' | 'sink';
  label: string;
  subtitle: string;
  itemId?: ItemId;
  recipeId?: RecipeId;
  targetId?: string;
  sinkRuleId?: string;
  targetMode?: ProductTarget['mode'];
  amountPerMinute?: number;
  sinkPointsPerMinute?: number;
  machineDisplayName?: string;
  machineCount?: number;
}

export interface ProductionGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  itemId: ItemId;
  label: string;
  amountPerMinute: number;
}

export interface ProductionGraphOptions {
  rateDecimalPlaces?: RateDecimalPlaces;
  sinkRules?: readonly SinkRule[];
}

const MIN_GRAPH_RATE = 0.000001;
const DEFAULT_RATE_DECIMAL_PLACES = 3;

export function buildProductionGraph(
  dataset: GameDataset,
  targets: ProductTarget[],
  result: ProductionPlanResult,
  options: ProductionGraphOptions = {},
): ProductionGraph {
  const nodes = new Map<string, ProductionGraphNode>();
  const edges: ProductionGraphEdge[] = [];
  const rateDecimalPlaces = options.rateDecimalPlaces ?? DEFAULT_RATE_DECIMAL_PLACES;
  const itemFlows = routeSurplusFlowsToSink(dataset, options.sinkRules ?? [], result);

  for (const [itemId, amountPerMinute] of Object.entries(result.rawInputs)) {
    if (amountPerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    const item = dataset.items[itemId];
    nodes.set(resourceNodeId(itemId), {
      id: resourceNodeId(itemId),
      kind: 'resource',
      label: item?.displayName ?? itemId,
      subtitle: `${formatRate(amountPerMinute, rateDecimalPlaces)}/min input`,
      itemId,
      amountPerMinute,
    });
  }

  for (const [itemId, amountPerMinute] of Object.entries(result.externalInputs ?? {})) {
    if (amountPerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    const item = dataset.items[itemId];
    nodes.set(externalInputNodeId(itemId), {
      id: externalInputNodeId(itemId),
      kind: 'externalInput',
      label: item?.displayName ?? itemId,
      subtitle: `${formatRate(amountPerMinute, rateDecimalPlaces)}/min supplied`,
      itemId,
      amountPerMinute,
    });
  }

  for (const [itemId, amountPerMinute] of Object.entries(result.assumedInputs ?? {})) {
    if (amountPerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    const item = dataset.items[itemId];
    nodes.set(assumedInputNodeId(itemId), {
      id: assumedInputNodeId(itemId),
      kind: 'assumedInput',
      label: item?.displayName ?? itemId,
      subtitle: `${formatRate(amountPerMinute, rateDecimalPlaces)}/min assumed source`,
      itemId,
      amountPerMinute,
    });
  }

  for (const usage of result.machineUsage) {
    if (usage.recipeRatePerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    nodes.set(recipeNodeId(usage.recipeId), {
      id: recipeNodeId(usage.recipeId),
      kind: 'recipe',
      label: usage.recipeDisplayName,
      subtitle: `${formatMachineCount(usage.machineCount, rateDecimalPlaces)}x ${usage.machineDisplayName}`,
      recipeId: usage.recipeId,
      amountPerMinute: usage.recipeRatePerMinute,
      machineDisplayName: usage.machineDisplayName,
      machineCount: usage.machineCount,
    });
  }

  for (const target of targets.toSorted((left, right) => left.sortOrder - right.sortOrder)) {
    const item = dataset.items[target.itemId];
    const amountPerMinute =
      target.mode === 'fixed'
        ? (target.amountPerMinute ?? 0)
        : (result.outputs[target.itemId] ?? 0);
    nodes.set(outputNodeId(target.id), {
      id: outputNodeId(target.id),
      kind: 'output',
      label: item?.displayName ?? target.itemId,
      subtitle:
        target.mode === 'maximize'
          ? `maximize, solved ${formatRate(amountPerMinute, rateDecimalPlaces)}/min`
          : `${formatRate(amountPerMinute, rateDecimalPlaces)}/min target`,
      itemId: target.itemId,
      targetId: target.id,
      targetMode: target.mode,
      amountPerMinute,
    });
  }

  for (const [itemId, amountPerMinute] of Object.entries(result.surplus)) {
    if (amountPerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    const item = dataset.items[itemId];
    const sinkRule = surplusSinkRuleForItem(options.sinkRules ?? [], itemId);
    if (sinkRule && isSinkableItem(dataset, itemId)) {
      const pointsPerMinute = sinkPointsPerMinute(dataset, itemId, amountPerMinute) ?? 0;
      nodes.set(sinkNodeId(itemId), {
        id: sinkNodeId(itemId),
        kind: 'sink',
        label: 'Awesome Sink',
        subtitle: `${formatRate(amountPerMinute, rateDecimalPlaces)}/min ${item?.displayName ?? itemId}`,
        itemId,
        sinkRuleId: sinkRule.id,
        amountPerMinute,
        sinkPointsPerMinute: pointsPerMinute,
      });
    } else {
      nodes.set(byproductNodeId(itemId), {
        id: byproductNodeId(itemId),
        kind: 'byproduct',
        label: item?.displayName ?? itemId,
        subtitle: `${formatRate(amountPerMinute, rateDecimalPlaces)}/min surplus`,
        itemId,
        amountPerMinute,
      });
    }
  }

  for (const flow of itemFlows) {
    if (flow.amountPerMinute <= MIN_GRAPH_RATE) {
      continue;
    }
    const sourceNodeId = endpointNodeId(flow.source);
    const targetNodeId = endpointNodeId(flow.target);
    if (!nodes.has(sourceNodeId) || !nodes.has(targetNodeId)) {
      continue;
    }
    const item = dataset.items[flow.itemId];
    edges.push({
      id: `${sourceNodeId}->${targetNodeId}:${flow.itemId}`,
      sourceNodeId,
      targetNodeId,
      itemId: flow.itemId,
      label: `${item?.displayName ?? flow.itemId} ${formatRate(flow.amountPerMinute, rateDecimalPlaces)}/min`,
      amountPerMinute: flow.amountPerMinute,
    });
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

export function resourceNodeId(itemId: ItemId): string {
  return `resource:${itemId}`;
}

export function externalInputNodeId(itemId: ItemId): string {
  return `external-input:${itemId}`;
}

export function assumedInputNodeId(itemId: ItemId): string {
  return `assumed-input:${itemId}`;
}

export function recipeNodeId(recipeId: RecipeId): string {
  return `recipe:${recipeId}`;
}

export function outputNodeId(targetId: string): string {
  return `output:${targetId}`;
}

export function byproductNodeId(itemId: ItemId): string {
  return `byproduct:${itemId}`;
}

export function sinkNodeId(itemId: ItemId): string {
  return `sink:${itemId}`;
}

export function routeSurplusFlowsToSink(
  dataset: GameDataset,
  sinkRules: readonly SinkRule[],
  result: ProductionPlanResult,
): ItemFlow[] {
  if (sinkRules.length === 0) {
    return result.itemFlows;
  }

  return result.itemFlows.map((flow) => {
    if (
      flow.target.kind !== 'byproduct' ||
      !shouldRouteSurplusToSink(dataset, sinkRules, result, flow.itemId)
    ) {
      return flow;
    }

    return {
      ...flow,
      target: { kind: 'sink', id: flow.itemId },
    };
  });
}

export function shouldRouteSurplusToSink(
  dataset: GameDataset,
  sinkRules: readonly SinkRule[],
  result: ProductionPlanResult,
  itemId: ItemId,
): boolean {
  return (
    (result.surplus[itemId] ?? 0) > MIN_GRAPH_RATE &&
    surplusSinkRuleForItem(sinkRules, itemId) !== undefined &&
    isSinkableItem(dataset, itemId)
  );
}

function endpointNodeId(endpoint: ItemFlowEndpoint): string {
  switch (endpoint.kind) {
    case 'resource':
      return resourceNodeId(endpoint.id);
    case 'externalInput':
      return externalInputNodeId(endpoint.id);
    case 'assumedInput':
      return assumedInputNodeId(endpoint.id);
    case 'recipe':
      return recipeNodeId(endpoint.id);
    case 'output':
      return outputNodeId(endpoint.id);
    case 'byproduct':
      return byproductNodeId(endpoint.id);
    case 'sink':
      return sinkNodeId(endpoint.id);
  }
}

function formatRate(amountPerMinute: number, decimalPlaces: RateDecimalPlaces): string {
  return Number.isInteger(amountPerMinute)
    ? amountPerMinute.toString()
    : amountPerMinute.toFixed(decimalPlaces).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMachineCount(machineCount: number, decimalPlaces: RateDecimalPlaces): string {
  return Number.isInteger(machineCount)
    ? machineCount.toString()
    : machineCount.toFixed(decimalPlaces).replace(/0+$/, '').replace(/\.$/, '');
}
