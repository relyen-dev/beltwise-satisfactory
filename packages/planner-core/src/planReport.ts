import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import { assumedInputDefinitionForItemId } from './assumedInputs';
import {
  defaultResourceCapPerMinute,
  isUnlimitedResourceCap,
  normalizeResourceOverride,
  resourceCapsEqual,
} from './resourceOverrideMutations';
import {
  normalizePlainTextNote,
  objectivePresetDefinition,
  type PlannerProject,
  type ProductTarget,
  resolveObjectivePresetId,
} from './plan';
import { routeSurplusFlowsToSink, shouldRouteSurplusToSink } from './graphModel';
import type {
  ItemFlow,
  ItemFlowEndpoint,
  MachineUsage,
  PlanWarning,
  ProductionGraph,
  ProductionGraphNode,
  ProductionPlanResult,
  ProductionPlanStatus,
} from './graphModel';
import { sinkPointsPerMinute } from './sinkRules';

export type PlanReportIconRef =
  | { readonly kind: 'item'; readonly id: ItemId; readonly label: string }
  | { readonly kind: 'machine'; readonly id: MachineId; readonly label: string };

export type ResourceCapSource = 'default' | 'custom' | 'disabled';

export type PlanReportItemRateRole =
  | 'required-input'
  | 'recipe-output'
  | 'raw-resource-consumption'
  | 'external-input-supply'
  | 'assumed-input-supply'
  | 'maximized-output'
  | 'requested-output'
  | 'unused-surplus'
  | 'sink-consumption'
  | 'nuclear-byproduct';

export type OutputFuelPowerNoteKind =
  | 'biomass-demand-scaled'
  | 'water-logistics-not-modeled'
  | 'pipe-logistics-not-modeled'
  | 'nuclear-byproducts-shown'
  | 'clean-ficsonium';

export interface PlanReportItemRate {
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly amountPerMinute: number;
  readonly role: PlanReportItemRateRole | null;
}

export interface PlanReportFlow extends PlanReportItemRate {
  readonly flowKey: string;
  readonly endpointKind: ItemFlowEndpoint['kind'];
  readonly endpointLabel: string;
}

export interface PlanReportWarning {
  readonly code: string;
  readonly message: string;
  readonly itemId?: ItemId;
  readonly recipeId?: RecipeId;
}

export interface PlanReportTargetSummary {
  readonly targetId: string;
  readonly itemId: ItemId;
  readonly itemDisplayName: string | null;
  readonly mode: ProductTarget['mode'];
  readonly amountPerMinute: number;
}

export interface PlanReportSinkSummary {
  readonly sinkRuleId: string;
  readonly itemId: ItemId;
  readonly itemDisplayName: string;
  readonly amountPerMinute: number;
  readonly sinkPointsPerMinute: number;
}

export interface PlanReportMachineSummary {
  readonly machineId: MachineId;
  readonly machineDisplayName: string;
  readonly machineCount: number;
  readonly physicalMachineCount: number;
  readonly powerMw: number;
  readonly recipeGroupCount: number;
}

export interface PlanReportObjectiveSummary {
  readonly label: string;
  readonly hasMaximizeTarget: boolean;
}

export interface PlanReportNotesSummary {
  readonly hasPlanNote: boolean;
  readonly planNote: string;
  readonly nodeNotes: readonly PlanReportNodeNoteSummary[];
  readonly visibleNodeNoteCount: number;
  readonly staleNodeNoteCount: number;
}

export interface PlanReportNodeNoteSummary {
  readonly nodeId: string;
  readonly label: string;
  readonly kind: ProductionGraphNode['kind'] | null;
  readonly note: string;
  readonly visible: boolean;
}

export interface PlanOverviewReport {
  readonly status: ProductionPlanStatus | null;
  readonly powerMw: number;
  readonly activeRecipeGroupCount: number;
  readonly totalMachineCount: number;
  readonly totalPhysicalMachineCount: number;
  readonly rawInputTypeCount: number;
  readonly targetCount: number;
  readonly objective: PlanReportObjectiveSummary;
  readonly notes: PlanReportNotesSummary;
  readonly targets: readonly PlanReportTargetSummary[];
  readonly sinks: readonly PlanReportSinkSummary[];
  readonly rawInputs: readonly PlanReportItemRate[];
  readonly externalInputs: readonly PlanReportItemRate[];
  readonly assumedInputs: readonly PlanReportItemRate[];
  readonly surplus: readonly PlanReportItemRate[];
  readonly machineSummary: readonly PlanReportMachineSummary[];
  readonly warnings: readonly PlanReportWarning[];
}

export type SelectedNodeReportDetails =
  | RecipeNodeReportDetails
  | ResourceNodeReportDetails
  | ExternalInputNodeReportDetails
  | AssumedInputNodeReportDetails
  | OutputNodeReportDetails
  | ByproductNodeReportDetails
  | SinkNodeReportDetails;

export interface RecipeNodeReportDetails {
  readonly kind: 'recipe';
  readonly recipeName: string;
  readonly machineId: MachineId | null;
  readonly machineName: string;
  readonly machineCount: number;
  readonly physicalMachineCount: number;
  readonly recipeRatePerMinute: number;
  readonly powerMw: number | null;
  readonly inputs: readonly PlanReportItemRate[];
  readonly outputs: readonly PlanReportItemRate[];
}

export interface ResourceNodeReportDetails {
  readonly kind: 'resource';
  readonly item: PlanReportItemRate;
  readonly capPerMinute: number | undefined;
  readonly capSource: ResourceCapSource;
  readonly headroomPerMinute: number | null;
}

export interface ExternalInputNodeReportDetails {
  readonly kind: 'externalInput';
  readonly item: PlanReportItemRate;
}

export interface AssumedInputNodeReportDetails {
  readonly kind: 'assumedInput';
  readonly item: PlanReportItemRate;
  readonly sourceNote: string;
}

export interface OutputNodeReportDetails {
  readonly kind: 'output';
  readonly item: PlanReportItemRate;
  readonly targetMode: ProductTarget['mode'];
  readonly requestedAmountPerMinute: number | null;
  readonly solvedAmountPerMinute: number | null;
  readonly incomingAmountPerMinute: number;
  readonly fuelPower: OutputFuelPowerReport | null;
}

export interface OutputFuelPowerReport {
  readonly generatorId: MachineId;
  readonly generatorCount: number;
  readonly grossPowerMw: number;
  readonly fuelPerGeneratorPerMinute: number;
  readonly waste: PlanReportItemRate | null;
  readonly noteKind: OutputFuelPowerNoteKind;
}

export interface ByproductNodeReportDetails {
  readonly kind: 'byproduct';
  readonly item: PlanReportItemRate;
  readonly sinkPointsPerMinute: number | null;
}

export interface SinkNodeReportDetails {
  readonly kind: 'sink';
  readonly item: PlanReportItemRate;
  readonly sinkRuleId: string | null;
  readonly sinkPointsPerMinute: number;
}

export interface SelectedNodeReport {
  readonly nodeId: string;
  readonly kind: ProductionGraphNode['kind'];
  readonly label: string;
  readonly subtitle: string;
  readonly icon: PlanReportIconRef | null;
  readonly warnings: readonly PlanReportWarning[];
  readonly incomingFlows: readonly PlanReportFlow[];
  readonly outgoingFlows: readonly PlanReportFlow[];
  readonly details: SelectedNodeReportDetails;
}

export interface MachinePanelReport {
  readonly activeRecipeGroupCount: number;
  readonly usedMachineTypeCount: number;
  readonly totalMachineCount: number;
  readonly totalPhysicalMachineCount: number;
  readonly totalPowerMw: number;
}

interface GeneratorFuelDefinition {
  readonly generatorId: MachineId;
  readonly generatorPowerMw: number;
  readonly fuelPerGeneratorPerMinute: number;
  readonly wasteItemId?: ItemId;
  readonly wastePerGeneratorPerMinute?: number;
  readonly noteKind: OutputFuelPowerNoteKind;
}

const MIN_DISPLAY_RATE = 0.000001;

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

export function buildPlanOverviewReport(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  graph: ProductionGraph | null,
): PlanOverviewReport {
  const machineUsage = result?.machineUsage ?? [];
  const machineSummary = summarizeMachinesByType(machineUsage);
  const rawInputs = itemRateRows(dataset, result?.rawInputs ?? {});

  return {
    status: result?.status ?? null,
    powerMw: result?.powerMw ?? 0,
    activeRecipeGroupCount: machineUsage.length,
    totalMachineCount: machineUsage.reduce((total, usage) => total + usage.machineCount, 0),
    totalPhysicalMachineCount: sumPhysicalMachineCounts(machineUsage),
    rawInputTypeCount: rawInputs.length,
    targetCount: project.targets.length,
    objective: objectiveSummary(project),
    notes: buildPlanNotesSummary(project, graph),
    targets: project.targets
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((target) => targetSummary(dataset, result, target)),
    sinks: sinkSummaries(dataset, project, result),
    rawInputs,
    externalInputs: itemRateRows(dataset, result?.externalInputs ?? {}),
    assumedInputs: itemRateRows(dataset, result?.assumedInputs ?? {}, 'assumed-input-supply'),
    surplus: itemRateRows(dataset, unusedSurplus(dataset, project, result)),
    machineSummary,
    warnings: warningRows(result?.warnings ?? []),
  };
}

export function buildPlanNotesSummary(
  project: PlannerProject,
  graph: ProductionGraph | null,
): PlanReportNotesSummary {
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
          kind: graphNode?.kind ?? null,
          note,
          visible: graphNode !== undefined,
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

export function buildSelectedNodeReport(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): SelectedNodeReport {
  const incomingFlows = flowRows(dataset, project, result, selectedNode, 'incoming');
  const outgoingFlows = flowRows(dataset, project, result, selectedNode, 'outgoing');
  const details = selectedNodeDetails(dataset, project, result, selectedNode, incomingFlows);

  return {
    nodeId: selectedNode.id,
    kind: selectedNode.kind,
    label: selectedNode.label,
    subtitle: selectedNode.subtitle,
    icon: selectedNodeIcon(dataset, result, selectedNode),
    warnings: relatedWarnings(result, selectedNode),
    incomingFlows,
    outgoingFlows,
    details,
  };
}

export function summarizeMachinesByType(
  machineUsage: readonly MachineUsage[],
): PlanReportMachineSummary[] {
  const summaries = new Map<
    MachineId,
    {
      machineId: MachineId;
      machineDisplayName: string;
      machineCount: number;
      physicalMachineCount: number;
      powerMw: number;
      recipeGroupCount: number;
    }
  >();

  for (const usage of machineUsage) {
    const machineId: MachineId = usage.machineId;
    const existing = summaries.get(machineId);
    if (existing) {
      existing.machineCount += usage.machineCount;
      existing.physicalMachineCount += physicalMachineCountForEffective(usage.machineCount);
      existing.powerMw += usage.powerMw;
      existing.recipeGroupCount += 1;
      continue;
    }

    summaries.set(machineId, {
      machineId,
      machineDisplayName: usage.machineDisplayName,
      machineCount: usage.machineCount,
      physicalMachineCount: physicalMachineCountForEffective(usage.machineCount),
      powerMw: usage.powerMw,
      recipeGroupCount: 1,
    });
  }

  return Array.from(summaries.values()).toSorted(
    (left, right) =>
      right.machineCount - left.machineCount ||
      right.powerMw - left.powerMw ||
      left.machineDisplayName.localeCompare(right.machineDisplayName),
  );
}

export function summarizeMachineUsageByMachineId(
  result: ProductionPlanResult | null,
): ReadonlyMap<MachineId, PlanReportMachineSummary> {
  return new Map(
    summarizeMachinesByType(result?.machineUsage ?? []).map((row) => [row.machineId, row]),
  );
}

export function buildMachinePanelReport(result: ProductionPlanResult | null): MachinePanelReport {
  const machineUsage = result?.machineUsage ?? [];
  const usageByMachineId = summarizeMachineUsageByMachineId(result);

  return {
    activeRecipeGroupCount: machineUsage.length,
    usedMachineTypeCount: usageByMachineId.size,
    totalMachineCount: machineUsage.reduce((total, usage) => total + usage.machineCount, 0),
    totalPhysicalMachineCount: sumPhysicalMachineCounts(machineUsage),
    totalPowerMw: machineUsage.reduce((total, usage) => total + usage.powerMw, 0),
  };
}

function objectiveSummary(project: PlannerProject): PlanReportObjectiveSummary {
  const definition = objectivePresetDefinition(resolveObjectivePresetId(project.objectiveProfile));
  return {
    label: definition.label,
    hasMaximizeTarget: project.targets.some((target) => target.mode === 'maximize'),
  };
}

function selectedNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly PlanReportFlow[],
): SelectedNodeReportDetails {
  switch (selectedNode.kind) {
    case 'recipe':
      return recipeNodeDetails(dataset, result, selectedNode);
    case 'resource':
      return resourceNodeDetails(dataset, project, result, selectedNode);
    case 'externalInput':
      return externalInputNodeDetails(dataset, project, result, selectedNode);
    case 'assumedInput':
      return assumedInputNodeDetails(dataset, result, selectedNode);
    case 'output':
      return outputNodeDetails(dataset, project, result, selectedNode, incomingFlows);
    case 'byproduct':
      return byproductNodeDetails(dataset, result, selectedNode, incomingFlows);
    case 'sink':
      return sinkNodeDetails(dataset, selectedNode, incomingFlows);
  }
}

function recipeNodeDetails(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): RecipeNodeReportDetails {
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
  const machineId = usage?.machineId ?? fallbackMachineId ?? null;
  const machine = machineId ? dataset.machines[machineId] : undefined;
  const machineName =
    usage?.machineDisplayName ??
    selectedNode.machineDisplayName ??
    machine?.displayName ??
    'Unknown machine';
  const machineCount = usage?.machineCount ?? selectedNode.machineCount ?? 0;

  return {
    kind: 'recipe',
    recipeName: recipe?.displayName ?? selectedNode.label,
    machineId,
    machineName,
    machineCount,
    physicalMachineCount: physicalMachineCountForEffective(machineCount),
    recipeRatePerMinute,
    powerMw: usage?.powerMw ?? null,
    inputs:
      recipe?.ingredients.map((ingredient) =>
        itemRateRow(
          dataset,
          ingredient.itemId,
          ingredient.amount * recipeRatePerMinute,
          'required-input',
        ),
      ) ?? [],
    outputs:
      recipe?.products.map((product) =>
        itemRateRow(dataset, product.itemId, product.amount * recipeRatePerMinute, 'recipe-output'),
      ) ?? [],
  };
}

function resourceNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): ResourceNodeReportDetails {
  const itemId = selectedNode.itemId ?? '';
  const consumedAmountPerMinute =
    selectedNode.amountPerMinute ?? (itemId ? result?.rawInputs[itemId] : undefined) ?? 0;
  const resource = itemId ? dataset.resources[itemId] : undefined;
  const baselineCapPerMinute = resource ? defaultResourceCapPerMinute(resource) : undefined;
  const override = itemId
    ? normalizeResourceOverride(project.resourceOverrides[itemId] ?? {}, baselineCapPerMinute)
    : undefined;
  const enabled = override?.enabled !== false;
  const configuredCapPerMinute = override?.maxPerMinute ?? baselineCapPerMinute;
  const effectiveCapPerMinute = enabled ? configuredCapPerMinute : 0;
  const finiteCap =
    enabled &&
    effectiveCapPerMinute !== undefined &&
    !isUnlimitedResourceCap(effectiveCapPerMinute);

  return {
    kind: 'resource',
    item: itemRateRow(dataset, itemId, consumedAmountPerMinute, 'raw-resource-consumption'),
    capPerMinute: effectiveCapPerMinute,
    capSource: resourceCapSource(enabled, override, baselineCapPerMinute),
    headroomPerMinute: finiteCap ? effectiveCapPerMinute - consumedAmountPerMinute : null,
  };
}

function externalInputNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): ExternalInputNodeReportDetails {
  const itemId = selectedNode.itemId ?? '';
  const suppliedAmountPerMinute =
    selectedNode.amountPerMinute ??
    (itemId ? result?.externalInputs?.[itemId] : undefined) ??
    (itemId ? project.itemInputs[itemId]?.amountPerMinute : undefined) ??
    0;

  return {
    kind: 'externalInput',
    item: itemRateRow(dataset, itemId, suppliedAmountPerMinute, 'external-input-supply'),
  };
}

function assumedInputNodeDetails(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): AssumedInputNodeReportDetails {
  const itemId = selectedNode.itemId ?? '';
  const suppliedAmountPerMinute =
    selectedNode.amountPerMinute ?? (itemId ? result?.assumedInputs?.[itemId] : undefined) ?? 0;

  return {
    kind: 'assumedInput',
    item: itemRateRow(dataset, itemId, suppliedAmountPerMinute, 'assumed-input-supply'),
    sourceNote: assumedInputDefinitionForItemId(itemId)?.sourceNote ?? 'Modeled as supplied input.',
  };
}

function outputNodeDetails(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly PlanReportFlow[],
): OutputNodeReportDetails {
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

  return {
    kind: 'output',
    item: itemRateRow(
      dataset,
      itemId,
      displayAmountPerMinute,
      targetMode === 'maximize' ? 'maximized-output' : 'requested-output',
    ),
    targetMode,
    requestedAmountPerMinute: fixedRequest,
    solvedAmountPerMinute: maximizedOutput,
    incomingAmountPerMinute,
    fuelPower: outputFuelPowerDetails(dataset, itemId, displayAmountPerMinute),
  };
}

function byproductNodeDetails(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly PlanReportFlow[],
): ByproductNodeReportDetails {
  const itemId = selectedNode.itemId ?? '';
  const surplusAmountPerMinute =
    selectedNode.amountPerMinute ??
    (itemId ? result?.surplus[itemId] : undefined) ??
    sumAmounts(incomingFlows);

  return {
    kind: 'byproduct',
    item: itemRateRow(dataset, itemId, surplusAmountPerMinute, 'unused-surplus'),
    sinkPointsPerMinute: sinkPointsPerMinute(dataset, itemId, surplusAmountPerMinute),
  };
}

function sinkNodeDetails(
  dataset: GameDataset,
  selectedNode: ProductionGraphNode,
  incomingFlows: readonly PlanReportFlow[],
): SinkNodeReportDetails {
  const itemId = selectedNode.itemId ?? '';
  const amountPerMinute = selectedNode.amountPerMinute ?? sumAmounts(incomingFlows);
  const pointsPerMinute =
    selectedNode.sinkPointsPerMinute ?? sinkPointsPerMinute(dataset, itemId, amountPerMinute) ?? 0;

  return {
    kind: 'sink',
    item: itemRateRow(dataset, itemId, amountPerMinute, 'sink-consumption'),
    sinkRuleId: selectedNode.sinkRuleId ?? null,
    sinkPointsPerMinute: pointsPerMinute,
  };
}

function selectedNodeIcon(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
): PlanReportIconRef | null {
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
      kind: 'machine',
      id: machineId,
      label:
        usage?.machineDisplayName ?? dataset.machines[machineId]?.displayName ?? selectedNode.label,
    };
  }

  if (!selectedNode.itemId) {
    return null;
  }

  return {
    kind: 'item',
    id: selectedNode.itemId,
    label: dataset.items[selectedNode.itemId]?.displayName ?? selectedNode.label,
  };
}

function targetSummary(
  dataset: GameDataset,
  result: ProductionPlanResult | null,
  target: ProductTarget,
): PlanReportTargetSummary {
  const item = dataset.items[target.itemId];
  const amount =
    target.mode === 'fixed'
      ? (target.amountPerMinute ?? 0)
      : (outputAmountForTarget(result, target.id) ?? result?.outputs[target.itemId] ?? 0);

  return {
    targetId: target.id,
    itemId: target.itemId,
    itemDisplayName: target.itemId.length > 0 ? (item?.displayName ?? target.itemId) : null,
    mode: target.mode,
    amountPerMinute: amount,
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
): PlanReportFlow[] {
  const routedFlows = result ? routeSurplusFlowsToSink(dataset, project.sinkRules, result) : [];
  return routedFlows
    .filter((flow) =>
      endpointMatchesNode(direction === 'incoming' ? flow.target : flow.source, selectedNode),
    )
    .map((flow) => {
      const endpoint = direction === 'incoming' ? flow.source : flow.target;
      return {
        ...itemRateRow(dataset, flow.itemId, flow.amountPerMinute, null),
        flowKey: flowRowKey(flow, direction),
        endpointKind: endpoint.kind,
        endpointLabel: endpointDisplayName(dataset, project, endpoint),
      };
    })
    .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute);
}

function flowRowKey(flow: ItemFlow, direction: 'incoming' | 'outgoing'): string {
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
): OutputFuelPowerReport | null {
  const definition = GENERATOR_FUELS[itemId];
  if (!definition || amountPerMinute <= MIN_DISPLAY_RATE) {
    return null;
  }

  const generatorCount = amountPerMinute / definition.fuelPerGeneratorPerMinute;
  const waste =
    definition.wasteItemId === undefined || definition.wastePerGeneratorPerMinute === undefined
      ? null
      : itemRateRow(
          dataset,
          definition.wasteItemId,
          generatorCount * definition.wastePerGeneratorPerMinute,
          'nuclear-byproduct',
        );

  return {
    generatorId: definition.generatorId,
    generatorCount,
    grossPowerMw: generatorCount * definition.generatorPowerMw,
    fuelPerGeneratorPerMinute: definition.fuelPerGeneratorPerMinute,
    waste,
    noteKind: definition.noteKind,
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
    case 'assumedInput':
      return endpoint.kind === 'assumedInput' && endpoint.id === selectedNode.itemId;
    case 'recipe':
      return endpoint.kind === 'recipe' && endpoint.id === selectedNode.recipeId;
    case 'output':
      return endpoint.kind === 'output' && endpoint.id === selectedNode.targetId;
    case 'byproduct':
      return endpoint.kind === 'byproduct' && endpoint.id === selectedNode.itemId;
    case 'sink':
      return endpoint.kind === 'sink' && endpoint.id === selectedNode.itemId;
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
    case 'assumedInput':
    case 'byproduct':
      return dataset.items[endpoint.id]?.displayName ?? endpoint.id;
    case 'sink':
      return 'Awesome Sink';
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
): PlanReportWarning[] {
  return warningRows(
    (result?.warnings ?? []).filter(
      (warning) =>
        (selectedNode.itemId !== undefined && warning.itemId === selectedNode.itemId) ||
        (selectedNode.recipeId !== undefined && warning.recipeId === selectedNode.recipeId),
    ),
  );
}

function warningRows(warnings: readonly PlanWarning[]): PlanReportWarning[] {
  return warnings.map((warning) => ({
    code: warning.code,
    message: warningMessage(warning),
    ...(warning.itemId !== undefined ? { itemId: warning.itemId } : {}),
    ...(warning.recipeId !== undefined ? { recipeId: warning.recipeId } : {}),
  }));
}

function warningMessage(warning: PlanWarning): string {
  switch (warning.code) {
    case 'solver-infeasible':
      return 'This plan cannot be built with the current recipes, available raw resources, and Inputs.';
    case 'solver-unbounded':
      return 'This plan needs a practical limit before the planner can choose a final rate.';
    case 'solver-error':
      return 'The planner could not finish calculating this plan.';
    default:
      return warning.message;
  }
}

function itemRateRows(
  dataset: GameDataset,
  amounts: Readonly<Record<ItemId, number>>,
  role: PlanReportItemRateRole | null = null,
): PlanReportItemRate[] {
  return Object.entries(amounts)
    .filter(([, amountPerMinute]) => amountPerMinute > MIN_DISPLAY_RATE)
    .map(([itemId, amountPerMinute]) => itemRateRow(dataset, itemId, amountPerMinute, role))
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName));
}

function itemRateRow(
  dataset: GameDataset,
  itemId: ItemId,
  amountPerMinute: number,
  role: PlanReportItemRateRole | null,
): PlanReportItemRate {
  return {
    itemId,
    displayName: dataset.items[itemId]?.displayName ?? itemId,
    amountPerMinute,
    role,
  };
}

function sinkSummaries(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
): PlanReportSinkSummary[] {
  if (!result) {
    return [];
  }

  return project.sinkRules
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((rule) => {
      if (!shouldRouteSurplusToSink(dataset, project.sinkRules, result, rule.itemId)) {
        return [];
      }
      const amountPerMinute = result.surplus[rule.itemId] ?? 0;
      const pointsPerMinute = sinkPointsPerMinute(dataset, rule.itemId, amountPerMinute);
      if (pointsPerMinute === null) {
        return [];
      }
      return [
        {
          sinkRuleId: rule.id,
          itemId: rule.itemId,
          itemDisplayName: dataset.items[rule.itemId]?.displayName ?? rule.itemId,
          amountPerMinute,
          sinkPointsPerMinute: pointsPerMinute,
        },
      ];
    });
}

function unusedSurplus(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
): Record<ItemId, number> {
  if (!result) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(result.surplus).filter(
      ([itemId]) => !shouldRouteSurplusToSink(dataset, project.sinkRules, result, itemId),
    ),
  );
}

function resourceCapSource(
  enabled: boolean,
  override: PlannerProject['resourceOverrides'][ItemId] | undefined,
  baselineCapPerMinute: number | undefined,
): ResourceCapSource {
  if (!enabled) {
    return 'disabled';
  }
  if (
    override?.maxPerMinute !== undefined &&
    !resourceCapsEqual(override.maxPerMinute, baselineCapPerMinute)
  ) {
    return 'custom';
  }
  return 'default';
}

function compareNodeNoteSummaries(
  left: PlanReportNodeNoteSummary,
  right: PlanReportNodeNoteSummary,
): number {
  if (left.visible !== right.visible) {
    return left.visible ? -1 : 1;
  }
  return (
    nodeKindSortValue(left.kind).localeCompare(nodeKindSortValue(right.kind)) ||
    left.label.localeCompare(right.label) ||
    left.nodeId.localeCompare(right.nodeId)
  );
}

function nodeKindSortValue(kind: ProductionGraphNode['kind'] | null): string {
  return kind ?? 'not-visible';
}

function sumAmounts(rows: readonly PlanReportItemRate[]): number {
  return rows.reduce((total, row) => total + row.amountPerMinute, 0);
}

function sumPhysicalMachineCounts(machineUsage: readonly MachineUsage[]): number {
  return machineUsage.reduce(
    (total, usage) => total + physicalMachineCountForEffective(usage.machineCount),
    0,
  );
}

function physicalMachineCountForEffective(machineCount: number): number {
  return machineCount <= 0 ? 0 : Math.ceil(machineCount);
}

function biomassGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorBiomass_Automated_C',
    generatorPowerMw: 30,
    fuelPerGeneratorPerMinute,
    noteKind: 'biomass-demand-scaled',
  };
}

function coalGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorCoal_C',
    generatorPowerMw: 75,
    fuelPerGeneratorPerMinute,
    noteKind: 'water-logistics-not-modeled',
  };
}

function fuelGeneratorFuel(fuelPerGeneratorPerMinute: number): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorFuel_C',
    generatorPowerMw: 250,
    fuelPerGeneratorPerMinute,
    noteKind: 'pipe-logistics-not-modeled',
  };
}

function nuclearGeneratorFuel(
  fuelPerGeneratorPerMinute: number,
  wasteItemId: ItemId | null,
  wastePerGeneratorPerMinute: number | null,
): GeneratorFuelDefinition {
  return {
    generatorId: 'Build_GeneratorNuclear_C',
    generatorPowerMw: 2500,
    fuelPerGeneratorPerMinute,
    ...(wasteItemId === null ? {} : { wasteItemId }),
    ...(wastePerGeneratorPerMinute === null ? {} : { wastePerGeneratorPerMinute }),
    noteKind: wasteItemId === null ? 'clean-ficsonium' : 'nuclear-byproducts-shown',
  };
}
