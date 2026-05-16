import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type GraphNodeBuildState,
  type ItemFlowEndpoint,
  type PlannerProject,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ProductTarget,
} from '@beltwise/planner-core';
import { gameIconPathForItemId, gameIconPathForMachineId } from './game-icon.helpers';
import {
  defaultResourceCapPerMinute,
  formatResourceCap,
  isUnlimitedResourceCap,
  resourceCapsEqual,
} from './planner-domain.helpers';

export type InspectorIconKind = 'item' | 'machine';

export interface InspectorIcon {
  src: string;
  label: string;
  kind: InspectorIconKind;
}

export interface InspectorMetric {
  label: string;
  value: string;
  detail: string | null;
}

export interface InspectorWarningViewModel {
  code: string;
  message: string;
  itemId?: ItemId;
  recipeId?: RecipeId;
}

export interface InspectorItemRateRow {
  itemId: ItemId;
  displayName: string;
  iconSrc: string;
  amountPerMinute: number;
  amountPerMinuteLabel: string;
  detail: string | null;
}

export interface InspectorFlowRow extends InspectorItemRateRow {
  endpointKindLabel: string;
  endpointLabel: string;
}

export interface InspectorTargetSummary {
  targetId: string;
  itemId: ItemId;
  displayName: string;
  iconSrc: string;
  modeLabel: string;
  amountLabel: string;
}

export interface InspectorMachineUsageRow {
  recipeId: RecipeId;
  recipeDisplayName: string;
  machineDisplayName: string;
  machineIconSrc: string;
  machineCountLabel: string;
  recipeRateLabel: string;
  powerLabel: string;
}

export interface InspectorOverviewViewModel {
  metrics: InspectorMetric[];
  targets: InspectorTargetSummary[];
  topRawInputs: InspectorItemRateRow[];
  externalInputs: InspectorItemRateRow[];
  surplus: InspectorItemRateRow[];
  machineUsage: InspectorMachineUsageRow[];
  warnings: InspectorWarningViewModel[];
}

export type SelectedNodeDetails =
  | RecipeNodeDetails
  | ResourceNodeDetails
  | ExternalInputNodeDetails
  | OutputNodeDetails
  | ByproductNodeDetails;

export interface RecipeNodeDetails {
  kind: 'recipe';
  recipeName: string;
  machineName: string;
  machineIcon: InspectorIcon | null;
  machineCountLabel: string;
  recipeRateLabel: string;
  powerLabel: string | null;
  inputs: InspectorItemRateRow[];
  outputs: InspectorItemRateRow[];
}

export interface ResourceNodeDetails {
  kind: 'resource';
  item: InspectorItemRateRow;
  capLabel: string;
  capSourceLabel: string;
  headroomLabel: string | null;
}

export interface ExternalInputNodeDetails {
  kind: 'externalInput';
  item: InspectorItemRateRow;
  sourceNote: string;
}

export interface OutputNodeDetails {
  kind: 'output';
  item: InspectorItemRateRow;
  targetModeLabel: string;
  requestedAmountPerMinuteLabel: string | null;
  solvedAmountPerMinuteLabel: string | null;
  incomingAmountPerMinuteLabel: string;
}

export interface ByproductNodeDetails {
  kind: 'byproduct';
  item: InspectorItemRateRow;
  sinkPointsPerMinuteLabel: string | null;
  surplusNote: string;
}

export interface InspectorSelectedNodeViewModel {
  nodeId: string;
  kindLabel: string;
  label: string;
  subtitle: string;
  icon: InspectorIcon | null;
  state: GraphNodeBuildState;
  metrics: InspectorMetric[];
  warnings: InspectorWarningViewModel[];
  incomingFlows: InspectorFlowRow[];
  outgoingFlows: InspectorFlowRow[];
  details: SelectedNodeDetails;
}

export interface InspectorViewModel {
  mode: 'overview' | 'selected';
  overview: InspectorOverviewViewModel | null;
  selection: InspectorSelectedNodeViewModel | null;
}

const MAX_OVERVIEW_RAW_INPUTS = 5;
const MIN_DISPLAY_RATE = 0.000001;

export function selectInspectorViewModel(
  dataset: GameDataset | null,
  project: PlannerProject | null,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode | null,
  selectedNodeState: GraphNodeBuildState,
): InspectorViewModel | null {
  if (!dataset || !project) {
    return null;
  }

  if (selectedNode) {
    return {
      mode: 'selected',
      overview: null,
      selection: selectSelectedNodeViewModel(
        dataset,
        project,
        result,
        selectedNode,
        selectedNodeState,
      ),
    };
  }

  return {
    mode: 'overview',
    overview: selectOverviewViewModel(dataset, project, result),
    selection: null,
  };
}

function selectOverviewViewModel(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
): InspectorOverviewViewModel {
  const machineUsage = result?.machineUsage ?? [];
  const totalMachineCount = machineUsage.reduce((total, usage) => total + usage.machineCount, 0);
  const rawInputRows = itemRateRows(dataset, result?.rawInputs ?? {});

  return {
    metrics: [
      metric('Solve status', result ? formatStatus(result.status) : 'No result'),
      metric('Power', result ? formatPower(result.powerMw) : '0 MW'),
      metric('Recipes', formatInteger(machineUsage.length), 'active recipe groups'),
      metric(
        'Machines',
        `${formatNumber(totalMachineCount)}x`,
        'total constructors, smelters, etc.',
      ),
      metric('Raw inputs', formatInteger(rawInputRows.length), 'resource types'),
      metric('Targets', formatInteger(project.targets.length), 'configured outputs'),
    ],
    targets: project.targets
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((target) => targetSummary(dataset, result, target)),
    topRawInputs: rawInputRows
      .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute)
      .slice(0, MAX_OVERVIEW_RAW_INPUTS),
    externalInputs: itemRateRows(dataset, result?.externalInputs ?? {}),
    surplus: itemRateRows(dataset, result?.surplus ?? {}),
    machineUsage: machineUsage.map((usage) => ({
      recipeId: usage.recipeId,
      recipeDisplayName: usage.recipeDisplayName,
      machineDisplayName: usage.machineDisplayName,
      machineIconSrc: gameIconPathForMachineId(usage.machineId),
      machineCountLabel: `${formatNumber(usage.machineCount)}x`,
      recipeRateLabel: `${formatNumber(usage.recipeRatePerMinute)}/min`,
      powerLabel: formatPower(usage.powerMw),
    })),
    warnings: warningRows(result?.warnings ?? []),
  };
}

function selectSelectedNodeViewModel(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  selectedNodeState: GraphNodeBuildState,
): InspectorSelectedNodeViewModel {
  const incomingFlows = flowRows(dataset, project, result, selectedNode, 'incoming');
  const outgoingFlows = flowRows(dataset, project, result, selectedNode, 'outgoing');
  const details = selectedNodeDetails(dataset, project, result, selectedNode, incomingFlows);

  return {
    nodeId: selectedNode.id,
    kindLabel: nodeKindLabel(selectedNode.kind),
    label: selectedNode.label,
    subtitle: selectedNode.subtitle,
    icon: selectedNodeIcon(dataset, result, selectedNode),
    state: selectedNodeState,
    metrics: selectedNodeMetrics(details),
    warnings: relatedWarnings(result, selectedNode),
    incomingFlows,
    outgoingFlows,
    details,
  };
}

function selectedNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly InspectorFlowRow[],
): SelectedNodeDetails {
  switch (selectedNode.kind) {
    case 'recipe':
      return recipeNodeDetails(dataset, result, selectedNode);
    case 'resource':
      return resourceNodeDetails(dataset, project, result, selectedNode);
    case 'externalInput':
      return externalInputNodeDetails(dataset, project, result, selectedNode);
    case 'output':
      return outputNodeDetails(dataset, project, result, selectedNode, incomingFlows);
    case 'byproduct':
      return byproductNodeDetails(dataset, result, selectedNode, incomingFlows);
  }
}

function recipeNodeDetails(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): RecipeNodeDetails {
  const recipeId = selectedNode.recipeId;
  const usage = recipeId
    ? result?.machineUsage.find((candidate) => candidate.recipeId === recipeId)
    : undefined;
  const recipe = recipeId ? dataset.recipes[recipeId] : undefined;
  const recipeRatePerMinute =
    usage?.recipeRatePerMinute ??
    selectedNode.amountPerMinute ??
    (recipeId ? result?.recipeRates[recipeId] : undefined) ??
    0;
  const fallbackMachineId = recipe?.producedIn.find((machineId) => dataset.machines[machineId]);
  const machineId: MachineId | undefined = usage?.machineId ?? fallbackMachineId;
  const machine = machineId ? dataset.machines[machineId] : undefined;
  const machineName =
    usage?.machineDisplayName ??
    selectedNode.machineDisplayName ??
    machine?.displayName ??
    'Unknown machine';
  const machineIcon =
    machineId === undefined
      ? null
      : {
          src: gameIconPathForMachineId(machineId),
          label: machineName,
          kind: 'machine' as const,
        };

  return {
    kind: 'recipe',
    recipeName: recipe?.displayName ?? selectedNode.label,
    machineName,
    machineIcon,
    machineCountLabel: `${formatNumber(usage?.machineCount ?? selectedNode.machineCount ?? 0)}x`,
    recipeRateLabel: `${formatNumber(recipeRatePerMinute)}/min`,
    powerLabel: usage ? formatPower(usage.powerMw) : null,
    inputs:
      recipe?.ingredients.map((ingredient) =>
        itemRateRow(
          dataset,
          ingredient.itemId,
          ingredient.amount * recipeRatePerMinute,
          'required input',
        ),
      ) ?? [],
    outputs:
      recipe?.products.map((product) =>
        itemRateRow(dataset, product.itemId, product.amount * recipeRatePerMinute, 'recipe output'),
      ) ?? [],
  };
}

function resourceNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): ResourceNodeDetails {
  const itemId = selectedNode.itemId ?? '';
  const consumedAmountPerMinute =
    selectedNode.amountPerMinute ?? (itemId ? result?.rawInputs[itemId] : undefined) ?? 0;
  const resource = itemId ? dataset.resources[itemId] : undefined;
  const baselineCapPerMinute = resource ? defaultResourceCapPerMinute(resource) : undefined;
  const override = itemId ? project.resourceOverrides[itemId] : undefined;
  const enabled = override?.enabled !== false;
  const configuredCapPerMinute = override?.maxPerMinute ?? baselineCapPerMinute;
  const effectiveCapPerMinute = enabled ? configuredCapPerMinute : 0;
  const finiteCap =
    enabled &&
    effectiveCapPerMinute !== undefined &&
    !isUnlimitedResourceCap(effectiveCapPerMinute);
  const headroomLabel = finiteCap
    ? `${formatNumber(effectiveCapPerMinute - consumedAmountPerMinute)}/min`
    : null;

  return {
    kind: 'resource',
    item: itemRateRow(dataset, itemId, consumedAmountPerMinute, 'consumed from raw resources'),
    capLabel: enabled ? formatResourceCap(effectiveCapPerMinute) : '0/min',
    capSourceLabel: resourceCapSourceLabel(enabled, override, baselineCapPerMinute),
    headroomLabel,
  };
}

function externalInputNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): ExternalInputNodeDetails {
  const itemId = selectedNode.itemId ?? '';
  const suppliedAmountPerMinute =
    selectedNode.amountPerMinute ??
    (itemId ? result?.externalInputs?.[itemId] : undefined) ??
    (itemId ? project.itemInputs[itemId]?.amountPerMinute : undefined) ??
    0;

  return {
    kind: 'externalInput',
    item: itemRateRow(dataset, itemId, suppliedAmountPerMinute, 'supplied externally'),
    sourceNote: 'Manual supply from another factory.',
  };
}

function outputNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly InspectorFlowRow[],
): OutputNodeDetails {
  const itemId = selectedNode.itemId ?? '';
  const target = selectedNode.targetId
    ? project.targets.find((candidate) => candidate.id === selectedNode.targetId)
    : undefined;
  const targetMode = selectedNode.targetMode ?? target?.mode ?? 'fixed';
  const incomingAmountPerMinute = sumAmounts(incomingFlows);
  const fixedRequest =
    targetMode === 'fixed'
      ? (target?.amountPerMinute ?? selectedNode.amountPerMinute ?? incomingAmountPerMinute)
      : null;
  const maximizedOutput =
    targetMode === 'maximize'
      ? (selectedNode.amountPerMinute ??
        (itemId ? result?.outputs[itemId] : undefined) ??
        incomingAmountPerMinute)
      : null;

  return {
    kind: 'output',
    item: itemRateRow(
      dataset,
      itemId,
      selectedNode.amountPerMinute ?? incomingAmountPerMinute,
      targetMode === 'maximize' ? 'maximized output' : 'requested output',
    ),
    targetModeLabel: targetMode === 'maximize' ? 'Maximize' : 'Fixed',
    requestedAmountPerMinuteLabel:
      fixedRequest === null ? null : `${formatNumber(fixedRequest)}/min`,
    solvedAmountPerMinuteLabel:
      maximizedOutput === null ? null : `${formatNumber(maximizedOutput)}/min`,
    incomingAmountPerMinuteLabel: `${formatNumber(incomingAmountPerMinute)}/min`,
  };
}

function byproductNodeDetails(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly InspectorFlowRow[],
): ByproductNodeDetails {
  const itemId = selectedNode.itemId ?? '';
  const item = itemId ? dataset.items[itemId] : undefined;
  const surplusAmountPerMinute =
    selectedNode.amountPerMinute ??
    (itemId ? result?.surplus[itemId] : undefined) ??
    sumAmounts(incomingFlows);
  const sinkPointsPerMinute =
    item?.sinkPoints === undefined ? null : item.sinkPoints * surplusAmountPerMinute;

  return {
    kind: 'byproduct',
    item: itemRateRow(dataset, itemId, surplusAmountPerMinute, 'unused surplus'),
    sinkPointsPerMinuteLabel:
      sinkPointsPerMinute === null ? null : `${formatNumber(sinkPointsPerMinute)}/min`,
    surplusNote: 'Unused surplus. Sink routing is not modeled yet.',
  };
}

function selectedNodeMetrics(details: SelectedNodeDetails): InspectorMetric[] {
  switch (details.kind) {
    case 'recipe':
      return [
        metric('Machine', details.machineName),
        metric('Machines', details.machineCountLabel),
        metric('Executions', details.recipeRateLabel),
        metric('Power', details.powerLabel ?? 'Unavailable'),
      ];
    case 'resource':
      return [
        metric('Consumed', details.item.amountPerMinuteLabel),
        metric('Cap', details.capLabel, details.capSourceLabel),
        metric(
          'Headroom',
          details.headroomLabel ??
            (details.capSourceLabel === 'Disabled' ? 'Disabled' : 'Unlimited'),
        ),
      ];
    case 'externalInput':
      return [metric('Supplied', details.item.amountPerMinuteLabel), metric('Source', 'Manual')];
    case 'output':
      return [
        metric('Mode', details.targetModeLabel),
        metric(
          details.targetModeLabel === 'Maximize' ? 'Solved' : 'Requested',
          details.solvedAmountPerMinuteLabel ?? details.requestedAmountPerMinuteLabel ?? '0/min',
        ),
        metric('Incoming', details.incomingAmountPerMinuteLabel),
      ];
    case 'byproduct':
      return [
        metric('Surplus', details.item.amountPerMinuteLabel),
        metric('Sink points', details.sinkPointsPerMinuteLabel ?? 'Not sinkable'),
      ];
  }
}

function selectedNodeIcon(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): InspectorIcon | null {
  if (selectedNode.kind === 'recipe') {
    const usage = selectedNode.recipeId
      ? result?.machineUsage.find((candidate) => candidate.recipeId === selectedNode.recipeId)
      : undefined;
    const recipe = selectedNode.recipeId ? dataset.recipes[selectedNode.recipeId] : undefined;
    const machineId = usage?.machineId ?? recipe?.producedIn.find((id) => dataset.machines[id]);
    if (!machineId) {
      return null;
    }
    return {
      src: gameIconPathForMachineId(machineId),
      label:
        usage?.machineDisplayName ?? dataset.machines[machineId]?.displayName ?? selectedNode.label,
      kind: 'machine',
    };
  }

  if (!selectedNode.itemId) {
    return null;
  }

  return {
    src: gameIconPathForItemId(selectedNode.itemId),
    label: dataset.items[selectedNode.itemId]?.displayName ?? selectedNode.label,
    kind: 'item',
  };
}

function targetSummary(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  target: ProductTarget,
): InspectorTargetSummary {
  const item = dataset.items[target.itemId];
  const amount =
    target.mode === 'fixed' ? (target.amountPerMinute ?? 0) : (result?.outputs[target.itemId] ?? 0);
  const displayName =
    target.itemId.length > 0 ? (item?.displayName ?? target.itemId) : 'Choose an item';

  return {
    targetId: target.id,
    itemId: target.itemId,
    displayName,
    iconSrc: target.itemId.length > 0 ? gameIconPathForItemId(target.itemId) : '',
    modeLabel: target.mode === 'maximize' ? 'Maximize' : 'Fixed',
    amountLabel:
      target.mode === 'maximize'
        ? `${formatNumber(amount)}/min solved`
        : `${formatNumber(amount)}/min requested`,
  };
}

function flowRows(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  direction: 'incoming' | 'outgoing',
): InspectorFlowRow[] {
  return (result?.itemFlows ?? [])
    .filter((flow) =>
      endpointMatchesNode(direction === 'incoming' ? flow.target : flow.source, selectedNode),
    )
    .map((flow) => {
      const endpoint = direction === 'incoming' ? flow.source : flow.target;
      return {
        ...itemRateRow(dataset, flow.itemId, flow.amountPerMinute, null),
        endpointKindLabel: endpointKindLabel(endpoint.kind),
        endpointLabel: endpointDisplayName(dataset, project, endpoint),
      };
    })
    .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute);
}

function endpointMatchesNode(
  endpoint: ItemFlowEndpoint,
  selectedNode: ProductionGraphNode,
): boolean {
  switch (selectedNode.kind) {
    case 'resource':
      return endpoint.kind === 'resource' && endpoint.id === selectedNode.itemId;
    case 'externalInput':
      return endpoint.kind === 'externalInput' && endpoint.id === selectedNode.itemId;
    case 'recipe':
      return endpoint.kind === 'recipe' && endpoint.id === selectedNode.recipeId;
    case 'output':
      return endpoint.kind === 'output' && endpoint.id === selectedNode.targetId;
    case 'byproduct':
      return endpoint.kind === 'byproduct' && endpoint.id === selectedNode.itemId;
  }
}

function endpointDisplayName(
  dataset: GameDataset,
  project: PlannerProject,
  endpoint: ItemFlowEndpoint,
): string {
  switch (endpoint.kind) {
    case 'resource':
    case 'externalInput':
    case 'byproduct':
      return dataset.items[endpoint.id]?.displayName ?? endpoint.id;
    case 'recipe':
      return dataset.recipes[endpoint.id]?.displayName ?? endpoint.id;
    case 'output': {
      const target = project.targets.find((candidate) => candidate.id === endpoint.id);
      return target ? (dataset.items[target.itemId]?.displayName ?? target.itemId) : endpoint.id;
    }
  }
}

function relatedWarnings(
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): InspectorWarningViewModel[] {
  return warningRows(
    (result?.warnings ?? []).filter(
      (warning) =>
        (selectedNode.itemId !== undefined && warning.itemId === selectedNode.itemId) ||
        (selectedNode.recipeId !== undefined && warning.recipeId === selectedNode.recipeId),
    ),
  );
}

function warningRows(
  warnings: readonly ProductionPlanResult['warnings'][number][],
): InspectorWarningViewModel[] {
  return warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    ...(warning.itemId !== undefined ? { itemId: warning.itemId } : {}),
    ...(warning.recipeId !== undefined ? { recipeId: warning.recipeId } : {}),
  }));
}

function itemRateRows(
  dataset: GameDataset,
  amounts: Readonly<Record<ItemId, number>>,
): InspectorItemRateRow[] {
  return Object.entries(amounts)
    .filter(([, amountPerMinute]) => amountPerMinute > MIN_DISPLAY_RATE)
    .map(([itemId, amountPerMinute]) => itemRateRow(dataset, itemId, amountPerMinute, null))
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName));
}

function itemRateRow(
  dataset: GameDataset,
  itemId: ItemId,
  amountPerMinute: number,
  detail: string | null,
): InspectorItemRateRow {
  return {
    itemId,
    displayName: dataset.items[itemId]?.displayName ?? itemId,
    iconSrc: gameIconPathForItemId(itemId),
    amountPerMinute,
    amountPerMinuteLabel: `${formatNumber(amountPerMinute)}/min`,
    detail,
  };
}

function resourceCapSourceLabel(
  enabled: boolean,
  override: PlannerProject['resourceOverrides'][ItemId] | undefined,
  baselineCapPerMinute: number | undefined,
): string {
  if (!enabled) {
    return 'Disabled';
  }
  if (
    override?.maxPerMinute !== undefined &&
    !resourceCapsEqual(override.maxPerMinute, baselineCapPerMinute)
  ) {
    return 'Custom cap';
  }
  return 'Default cap';
}

function metric(label: string, value: string, detail: string | null = null): InspectorMetric {
  return { label, value, detail };
}

function nodeKindLabel(kind: ProductionGraphNode['kind']): string {
  switch (kind) {
    case 'resource':
      return 'Resource';
    case 'externalInput':
      return 'External input';
    case 'recipe':
      return 'Recipe';
    case 'output':
      return 'Output';
    case 'byproduct':
      return 'Byproduct';
  }
}

function endpointKindLabel(kind: ItemFlowEndpoint['kind']): string {
  switch (kind) {
    case 'resource':
      return 'Resource';
    case 'externalInput':
      return 'External input';
    case 'recipe':
      return 'Recipe';
    case 'output':
      return 'Output';
    case 'byproduct':
      return 'Byproduct';
  }
}

function formatStatus(status: ProductionPlanResult['status']): string {
  switch (status) {
    case 'optimal':
      return 'Optimal';
    case 'infeasible':
      return 'Infeasible';
    case 'unbounded':
      return 'Unbounded';
    case 'error':
      return 'Error';
  }
}

function formatPower(powerMw: number): string {
  return `${formatNumber(powerMw)} MW`;
}

function formatInteger(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatNumber(value: number): string {
  const decimalPlaces = Math.abs(value) < 10 && !Number.isInteger(value) ? 3 : 2;
  return value
    .toLocaleString('en-US', {
      maximumFractionDigits: decimalPlaces,
      minimumFractionDigits: 0,
    })
    .replace(/^-0$/, '0');
}

function sumAmounts(rows: readonly InspectorItemRateRow[]): number {
  return rows.reduce((total, row) => total + row.amountPerMinute, 0);
}
