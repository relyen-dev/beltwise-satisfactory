import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type GraphNodeBuildState,
  type ItemFlowEndpoint,
  normalizePlainTextNote,
  objectivePresetDefinition,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ProductTarget,
  resolveObjectivePresetId,
} from '@beltwise/planner-core';
import { gameIconPathForItemId, gameIconPathForMachineId } from './game-icon.helpers';
import { formatPlannerInteger, formatPlannerNumber } from './planner-format.helpers';
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
  flowKey: string;
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

export interface InspectorMachineSummaryRow {
  machineId: MachineId;
  machineDisplayName: string;
  machineIconSrc: string;
  machineCountLabel: string;
  powerLabel: string;
  recipeGroupCountLabel: string;
}

export interface InspectorObjectiveSummary {
  label: string;
  detail: string;
}

export interface InspectorOverviewViewModel {
  metrics: InspectorMetric[];
  objective: InspectorObjectiveSummary;
  notes: InspectorNotesSummary;
  targets: InspectorTargetSummary[];
  topRawInputs: InspectorItemRateRow[];
  externalInputs: InspectorItemRateRow[];
  surplus: InspectorItemRateRow[];
  machineSummary: InspectorMachineSummaryRow[];
  machineSummaryTotalCount: number;
  hiddenMachineSummaryCount: number;
  warnings: InspectorWarningViewModel[];
}

export interface InspectorNotesSummary {
  hasPlanNote: boolean;
  planNote: string;
  nodeNotes: InspectorNodeNoteSummary[];
  visibleNodeNoteCount: number;
  staleNodeNoteCount: number;
}

export interface InspectorNodeNoteSummary {
  nodeId: string;
  label: string;
  kindLabel: string;
  note: string;
  visible: boolean;
  visibilityLabel: string;
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
  fuelPower: OutputFuelPowerDetails | null;
}

export interface OutputFuelPowerDetails {
  generatorName: string;
  generatorIcon: InspectorIcon;
  generatorCountLabel: string;
  grossPowerLabel: string;
  fuelPerGeneratorLabel: string;
  waste: InspectorItemRateRow | null;
  note: string;
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
const MAX_OVERVIEW_MACHINE_ROWS = 4;
const MIN_DISPLAY_RATE = 0.000001;

interface GeneratorFuelDefinition {
  generatorId: MachineId;
  generatorName: string;
  generatorPowerMw: number;
  fuelPerGeneratorPerMinute: number;
  wasteItemId?: ItemId;
  wastePerGeneratorPerMinute?: number;
  note: string;
}

const GENERATOR_FUELS: Readonly<Record<ItemId, GeneratorFuelDefinition>> = {
  Desc_Leaves_C: biomassGeneratorFuel(120),
  Desc_Wood_C: biomassGeneratorFuel(18),
  Desc_Mycelia_C: biomassGeneratorFuel(90),
  Desc_GenericBiomass_C: biomassGeneratorFuel(10),
  Desc_Biofuel_C: biomassGeneratorFuel(4),
  Desc_PackagedBiofuel_C: biomassGeneratorFuel(2.4),
  Desc_Coal_C: coalGeneratorFuel(15),
  Desc_CompactedCoal_C: coalGeneratorFuel(7.142857142857143),
  Desc_PetroleumCoke_C: coalGeneratorFuel(25),
  Desc_LiquidBiofuel_C: fuelGeneratorFuel(20),
  Desc_LiquidFuel_C: fuelGeneratorFuel(20),
  Desc_LiquidTurboFuel_C: fuelGeneratorFuel(7.5),
  Desc_RocketFuel_C: fuelGeneratorFuel(4.166666666666667),
  Desc_IonizedFuel_C: fuelGeneratorFuel(3),
  Desc_NuclearFuelRod_C: nuclearGeneratorFuel(0.2, 'Desc_NuclearWaste_C', 10),
  Desc_PlutoniumFuelRod_C: nuclearGeneratorFuel(0.1, 'Desc_PlutoniumWaste_C', 1),
  Desc_FicsoniumFuelRod_C: nuclearGeneratorFuel(1, null, null),
};

export function selectInspectorViewModel(
  dataset: GameDataset | null,
  project: PlannerProject | null,
  result: ProductionPlanResult | null,
  graph: ProductionGraph | null,
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
    overview: selectOverviewViewModel(dataset, project, result, graph),
    selection: null,
  };
}

function selectOverviewViewModel(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  graph: ProductionGraph | null,
): InspectorOverviewViewModel {
  const machineUsage = result?.machineUsage ?? [];
  const totalMachineCount = machineUsage.reduce((total, usage) => total + usage.machineCount, 0);
  const rawInputRows = itemRateRows(dataset, result?.rawInputs ?? {});
  const machineSummaryRows = summarizeMachinesByType(machineUsage);

  return {
    metrics: [
      metric('Solve status', result ? formatStatus(result.status) : 'No result'),
      metric('Power', result ? formatPower(result.powerMw) : '0 MW'),
      metric('Recipes', formatPlannerInteger(machineUsage.length), 'active recipe groups'),
      metric(
        'Machines',
        `${formatPlannerNumber(totalMachineCount)}x`,
        'total constructors, smelters, etc.',
      ),
      metric('Raw inputs', formatPlannerInteger(rawInputRows.length), 'resource types'),
      metric('Targets', formatPlannerInteger(project.targets.length), 'configured outputs'),
    ],
    objective: objectiveSummary(project),
    notes: selectNotesSummary(project, graph),
    targets: project.targets
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((target) => targetSummary(dataset, result, target)),
    topRawInputs: rawInputRows
      .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute)
      .slice(0, MAX_OVERVIEW_RAW_INPUTS),
    externalInputs: itemRateRows(dataset, result?.externalInputs ?? {}),
    surplus: itemRateRows(dataset, result?.surplus ?? {}),
    machineSummary: machineSummaryRows.slice(0, MAX_OVERVIEW_MACHINE_ROWS),
    machineSummaryTotalCount: machineSummaryRows.length,
    hiddenMachineSummaryCount: Math.max(0, machineSummaryRows.length - MAX_OVERVIEW_MACHINE_ROWS),
    warnings: warningRows(result?.warnings ?? []),
  };
}

export function selectNotesSummary(
  project: PlannerProject,
  graph: ProductionGraph | null,
): InspectorNotesSummary {
  const graphNodesById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const nodeNotes = Object.entries(project.buildState.nodeStates)
    .flatMap(([nodeId, nodeState]) => {
      const note = normalizePlainTextNote(nodeState.note ?? '');
      if (note.length === 0) {
        return [];
      }
      const graphNode = graphNodesById.get(nodeId);
      return [
        {
          nodeId,
          label: graphNode?.label ?? nodeId,
          kindLabel: graphNode ? nodeKindLabel(graphNode.kind) : 'Not visible',
          note,
          visible: graphNode !== undefined,
          visibilityLabel: graphNode ? 'Visible in graph' : 'Not currently visible',
        },
      ];
    })
    .toSorted(compareNodeNoteSummaries);
  const planNote = normalizePlainTextNote(project.notes);

  return {
    hasPlanNote: planNote.length > 0,
    planNote,
    nodeNotes,
    visibleNodeNoteCount: nodeNotes.filter((row) => row.visible).length,
    staleNodeNoteCount: nodeNotes.filter((row) => !row.visible).length,
  };
}

function objectiveSummary(project: PlannerProject): InspectorObjectiveSummary {
  const definition = objectivePresetDefinition(resolveObjectivePresetId(project.objectiveProfile));
  const hasMaximizeTarget = project.targets.some((target) => target.mode === 'maximize');
  return {
    label: definition.label,
    detail: hasMaximizeTarget
      ? 'Maximize targets solve first; this preset breaks route ties.'
      : 'Fixed outputs stay fixed; this preset chooses feasible routes.',
  };
}

function summarizeMachinesByType(
  machineUsage: readonly ProductionPlanResult['machineUsage'][number][],
): InspectorMachineSummaryRow[] {
  const summaries = new Map<
    MachineId,
    {
      machineId: MachineId;
      machineDisplayName: string;
      machineCount: number;
      powerMw: number;
      recipeGroupCount: number;
    }
  >();

  for (const usage of machineUsage) {
    const machineId: MachineId = usage.machineId;
    const existing = summaries.get(machineId);
    if (existing) {
      existing.machineCount += usage.machineCount;
      existing.powerMw += usage.powerMw;
      existing.recipeGroupCount += 1;
      continue;
    }

    summaries.set(machineId, {
      machineId,
      machineDisplayName: usage.machineDisplayName,
      machineCount: usage.machineCount,
      powerMw: usage.powerMw,
      recipeGroupCount: 1,
    });
  }

  return Array.from(summaries.values())
    .toSorted(
      (left, right) =>
        right.machineCount - left.machineCount ||
        right.powerMw - left.powerMw ||
        left.machineDisplayName.localeCompare(right.machineDisplayName),
    )
    .map((summary) => ({
      machineId: summary.machineId,
      machineDisplayName: summary.machineDisplayName,
      machineIconSrc: gameIconPathForMachineId(summary.machineId),
      machineCountLabel: `${formatPlannerNumber(summary.machineCount)}x`,
      powerLabel: formatPower(summary.powerMw),
      recipeGroupCountLabel: `${formatPlannerInteger(summary.recipeGroupCount)} ${
        summary.recipeGroupCount === 1 ? 'recipe' : 'recipes'
      }`,
    }));
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
    machineCountLabel: `${formatPlannerNumber(
      usage?.machineCount ?? selectedNode.machineCount ?? 0,
    )}x`,
    recipeRateLabel: `${formatPlannerNumber(recipeRatePerMinute)}/min`,
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
    ? `${formatPlannerNumber(effectiveCapPerMinute - consumedAmountPerMinute)}/min`
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
  const targetFlowAmountPerMinute =
    selectedNode.targetId && result ? incomingAmountPerMinute : null;
  const maximizedOutput =
    targetMode === 'maximize'
      ? (targetFlowAmountPerMinute ??
        selectedNode.amountPerMinute ??
        (itemId ? result?.outputs[itemId] : undefined) ??
        incomingAmountPerMinute)
      : null;
  const displayAmountPerMinute =
    targetMode === 'maximize'
      ? (maximizedOutput ?? incomingAmountPerMinute)
      : (selectedNode.amountPerMinute ?? incomingAmountPerMinute);
  const fuelPower = outputFuelPowerDetails(dataset, itemId, displayAmountPerMinute);

  return {
    kind: 'output',
    item: itemRateRow(
      dataset,
      itemId,
      displayAmountPerMinute,
      targetMode === 'maximize' ? 'maximized output' : 'requested output',
    ),
    targetModeLabel: targetMode === 'maximize' ? 'Maximize' : 'Fixed',
    requestedAmountPerMinuteLabel:
      fixedRequest === null ? null : `${formatPlannerNumber(fixedRequest)}/min`,
    solvedAmountPerMinuteLabel:
      maximizedOutput === null ? null : `${formatPlannerNumber(maximizedOutput)}/min`,
    incomingAmountPerMinuteLabel: `${formatPlannerNumber(incomingAmountPerMinute)}/min`,
    fuelPower,
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
      sinkPointsPerMinute === null ? null : `${formatPlannerNumber(sinkPointsPerMinute)}/min`,
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
    target.mode === 'fixed'
      ? (target.amountPerMinute ?? 0)
      : (outputAmountForTarget(result, target.id) ?? result?.outputs[target.itemId] ?? 0);
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
        ? `${formatPlannerNumber(amount)}/min solved`
        : `${formatPlannerNumber(amount)}/min requested`,
  };
}

function outputAmountForTarget(
  result: ProductionPlanResult | null,
  targetId: string | undefined,
): number | null {
  if (!result || !targetId) {
    return null;
  }

  return result.itemFlows
    .filter((flow) => flow.target.kind === 'output' && flow.target.id === targetId)
    .reduce((total, flow) => total + flow.amountPerMinute, 0);
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
        flowKey: flowRowKey(flow, direction),
        endpointKindLabel: endpointKindLabel(endpoint.kind),
        endpointLabel: endpointDisplayName(dataset, project, endpoint),
      };
    })
    .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute);
}

function flowRowKey(
  flow: ProductionPlanResult['itemFlows'][number],
  direction: 'incoming' | 'outgoing',
): string {
  return [
    direction,
    flow.itemId,
    flow.source.kind,
    flow.source.id,
    flow.target.kind,
    flow.target.id,
  ].join(':');
}

function outputFuelPowerDetails(
  dataset: GameDataset,
  itemId: ItemId,
  amountPerMinute: number,
): OutputFuelPowerDetails | null {
  const definition = GENERATOR_FUELS[itemId];
  if (!definition || amountPerMinute <= MIN_DISPLAY_RATE) {
    return null;
  }

  const generatorCount = amountPerMinute / definition.fuelPerGeneratorPerMinute;
  const grossPowerMw = generatorCount * definition.generatorPowerMw;
  const waste =
    definition.wasteItemId === undefined || definition.wastePerGeneratorPerMinute === undefined
      ? null
      : itemRateRow(
          dataset,
          definition.wasteItemId,
          generatorCount * definition.wastePerGeneratorPerMinute,
          'nuclear byproduct',
        );

  return {
    generatorName: definition.generatorName,
    generatorIcon: {
      src: gameIconPathForMachineId(definition.generatorId),
      label: definition.generatorName,
      kind: 'machine',
    },
    generatorCountLabel: `${formatPlannerNumber(generatorCount)}x`,
    grossPowerLabel: formatPower(grossPowerMw),
    fuelPerGeneratorLabel: `${formatPlannerNumber(definition.fuelPerGeneratorPerMinute)}/min each`,
    waste,
    note: definition.note,
  };
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
    amountPerMinuteLabel: `${formatPlannerNumber(amountPerMinute)}/min`,
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

function compareNodeNoteSummaries(
  left: InspectorNodeNoteSummary,
  right: InspectorNodeNoteSummary,
): number {
  if (left.visible !== right.visible) {
    return left.visible ? -1 : 1;
  }
  return (
    left.kindLabel.localeCompare(right.kindLabel) ||
    left.label.localeCompare(right.label) ||
    left.nodeId.localeCompare(right.nodeId)
  );
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
  return `${formatPlannerNumber(powerMw)} MW`;
}

function sumAmounts(rows: readonly InspectorItemRateRow[]): number {
  return rows.reduce((total, row) => total + row.amountPerMinute, 0);
}

function biomassGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorBiomass_Automated_C',
    generatorName: 'Biomass Burner',
    generatorPowerMw: 30,
    fuelPerGeneratorPerMinute,
    note: 'Gross estimate. Biomass Burners scale fuel burn to grid demand.',
  };
}

function coalGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorCoal_C',
    generatorName: 'Coal-Powered Generator',
    generatorPowerMw: 75,
    fuelPerGeneratorPerMinute,
    note: 'Gross estimate. Water logistics are not modeled here.',
  };
}

function fuelGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorFuel_C',
    generatorName: 'Fuel-Powered Generator',
    generatorPowerMw: 250,
    fuelPerGeneratorPerMinute,
    note: 'Gross estimate. Pipe throughput and generator nodes are not modeled here.',
  };
}

function nuclearGeneratorFuel(
  fuelPerGeneratorPerMinute: number,
  wasteItemId: ItemId | null,
  wastePerGeneratorPerMinute: number | null,
): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorNuclear_C',
    generatorName: 'Nuclear Power Plant',
    generatorPowerMw: 2500,
    fuelPerGeneratorPerMinute,
    ...(wasteItemId === null ? {} : { wasteItemId }),
    ...(wastePerGeneratorPerMinute === null ? {} : { wastePerGeneratorPerMinute }),
    note:
      wasteItemId === null
        ? 'Gross estimate. Water logistics are not modeled here; Ficsonium Fuel Rods burn clean.'
        : 'Gross estimate. Water logistics are not modeled here; nuclear byproducts are shown for planning.',
  };
}
