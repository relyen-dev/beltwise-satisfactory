import type { GameDataset, Item } from '@beltwise/game-data';
import type {
  ConveyorBeltTier,
  GraphDisplaySettings,
  GraphRendererEdge,
  PipelineTier,
} from '@beltwise/planner-core';
import { formatRate } from './graph-display-formatting';

export interface BeltwiseFoblexEdgeLabelLines {
  itemName: string;
  amountPerMinute: string;
  transportLines?: string;
  machineCount?: string;
}

export interface BeltwiseFoblexEdgeTransport {
  kind: 'belt' | 'pipe' | 'none';
  lineCount: number;
  tierLabel: string;
}

export interface GraphTransportDisplay {
  labelLines: BeltwiseFoblexEdgeLabelLines;
  transport: BeltwiseFoblexEdgeTransport;
}

export interface GraphTransportDisplayOptions {
  dataset: GameDataset | null;
  displaySettings: Pick<
    GraphDisplaySettings,
    'maxBeltTier' | 'maxPipeTier' | 'rateDecimalPlaces' | 'showTransportLabels'
  >;
}

interface EdgeLabelLinesOptions {
  dataset: GameDataset | null;
  displaySettings: Pick<GraphDisplaySettings, 'rateDecimalPlaces'>;
}

const BELT_CAPACITY_PER_MINUTE: Record<ConveyorBeltTier, number> = {
  1: 60,
  2: 120,
  3: 270,
  4: 480,
  5: 780,
  6: 1200,
};

const PIPE_CAPACITY_PER_MINUTE: Record<PipelineTier, number> = {
  1: 300,
  2: 600,
};

export function buildEdgeTransportDisplay(
  edge: GraphRendererEdge,
  options: GraphTransportDisplayOptions,
): GraphTransportDisplay {
  const transport = edgeTransport(edge, options);
  const labelLines = edgeLabelLines(edge, options);
  if (options.displaySettings.showTransportLabels && transport.kind !== 'none') {
    return {
      transport,
      labelLines: {
        ...labelLines,
        transportLines: formatTransportLines(transport),
      },
    };
  }

  return { transport, labelLines };
}

export function edgeLabelLines(
  edge: GraphRendererEdge,
  options: EdgeLabelLinesOptions,
): BeltwiseFoblexEdgeLabelLines {
  return {
    itemName: edgeItemDisplayName(edge, options.dataset),
    amountPerMinute: `${formatRate(
      edge.data.amountPerMinute,
      options.displaySettings.rateDecimalPlaces,
    )}/min`,
  };
}

export function edgeTransport(
  edge: GraphRendererEdge,
  options: GraphTransportDisplayOptions,
): BeltwiseFoblexEdgeTransport {
  const item = options.dataset?.items[edge.data.itemId];
  const kind = item ? transportKindForItem(item) : 'none';
  if (kind === 'belt') {
    const capacity = BELT_CAPACITY_PER_MINUTE[options.displaySettings.maxBeltTier];
    return {
      kind,
      lineCount: Math.max(1, Math.ceil(edge.data.amountPerMinute / capacity)),
      tierLabel: `Mk.${options.displaySettings.maxBeltTier}`,
    };
  }
  if (kind === 'pipe') {
    const capacity = PIPE_CAPACITY_PER_MINUTE[options.displaySettings.maxPipeTier];
    return {
      kind,
      lineCount: Math.max(1, Math.ceil(edge.data.amountPerMinute / capacity)),
      tierLabel: `Mk.${options.displaySettings.maxPipeTier}`,
    };
  }
  return { kind: 'none', lineCount: 0, tierLabel: '' };
}

export function formatTransportLines(transport: BeltwiseFoblexEdgeTransport): string {
  const noun = transport.kind === 'pipe' ? 'pipe' : 'belt';
  const suffix = transport.lineCount === 1 ? noun : `${noun}s`;
  return `${transport.lineCount}x ${transport.tierLabel} ${suffix}`;
}

function edgeItemDisplayName(edge: GraphRendererEdge, dataset: GameDataset | null): string {
  const item = dataset?.items[edge.data.itemId];
  return (item?.displayName ?? edge.data.itemId) || edge.label;
}

function transportKindForItem(item: Item): BeltwiseFoblexEdgeTransport['kind'] {
  if (item.form === 'liquid' || item.form === 'gas') {
    return 'pipe';
  }
  if (item.form === 'solid') {
    return 'belt';
  }
  return 'none';
}
