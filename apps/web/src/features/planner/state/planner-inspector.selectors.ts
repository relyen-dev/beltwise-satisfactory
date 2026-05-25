import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  buildPlanNotesSummary,
  buildPlanOverviewReport,
  buildSelectedNodeReport,
  isSinkableItem,
  surplusSinkRuleForItem,
  type GraphNodeBuildState,
  type OutputFuelPowerNoteKind,
  type PlanReportFlow,
  type PlanReportIconRef,
  type PlanReportItemRate,
  type PlanReportItemRateRole,
  type PlanReportMachineSummary,
  type PlanReportNodeNoteSummary,
  type PlanReportTargetSummary,
  type PlanReportWarning,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ResourceCapSource,
  type SelectedNodeReportDetails,
} from '@beltwise/planner-core';
import { gameIconPathForItemId, gameIconPathForMachineId } from '../shared-ui/game-icon.helpers';
import { formatPlannerInteger, formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { formatResourceCap } from '../shared-ui/planner-domain.helpers';

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
  physicalMachineCountLabel: string;
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
  assumedInputs: InspectorItemRateRow[];
  surplus: InspectorItemRateRow[];
  machineSummary: InspectorMachineSummaryRow[];
  totalPhysicalMachineCountLabel: string;
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
  | AssumedInputNodeDetails
  | PowerNodeDetails
  | OutputNodeDetails
  | ByproductNodeDetails
  | SinkNodeDetails;

export interface RecipeNodeDetails {
  kind: 'recipe';
  recipeName: string;
  machineName: string;
  machineIcon: InspectorIcon | null;
  machineCountLabel: string;
  physicalMachineCountLabel: string;
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

export interface AssumedInputNodeDetails {
  kind: 'assumedInput';
  item: InspectorItemRateRow;
  sourceNote: string;
}

export interface PowerNodeDetails {
  kind: 'power';
  generatorName: string;
  generatorIcon: InspectorIcon | null;
  generatorCountLabel: string;
  physicalGeneratorCountLabel: string;
  generatedPowerLabel: string;
  fuel: InspectorItemRateRow | null;
  supplementalInputs: InspectorItemRateRow[];
  byproducts: InspectorItemRateRow[];
}

export interface OutputNodeDetails {
  kind: 'output';
  item: InspectorItemRateRow;
  targetModeLabel: string;
  requestedAmountPerMinuteLabel: string | null;
  solvedAmountPerMinuteLabel: string | null;
  incomingAmountPerMinuteLabel: string;
  fuelPower: OutputFuelPowerDetails | null;
  surplusSinkAction: InspectorSurplusSinkAction | null;
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
  surplusSinkAction: InspectorSurplusSinkAction | null;
}

export interface SinkNodeDetails {
  kind: 'sink';
  item: InspectorItemRateRow;
  sinkPointsPerMinuteLabel: string;
  sinkAction: InspectorSinkAction | null;
}

export interface InspectorSurplusSinkAction {
  kind: 'surplus';
  itemId: ItemId;
  active: boolean;
  label: string;
  title: string;
}

export interface InspectorRemoveSinkRuleAction {
  kind: 'remove-rule';
  sinkRuleId: string;
  label: string;
  title: string;
}

export type InspectorSinkAction = InspectorSurplusSinkAction | InspectorRemoveSinkRuleAction;

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
  loopbackFlows: InspectorFlowRow[];
  details: SelectedNodeDetails;
}

export interface InspectorViewModel {
  mode: 'overview' | 'selected';
  overview: InspectorOverviewViewModel | null;
  selection: InspectorSelectedNodeViewModel | null;
}

const MAX_OVERVIEW_RAW_INPUTS = 5;
const MAX_OVERVIEW_MACHINE_ROWS = 4;

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
  const report = buildPlanOverviewReport(dataset, project, result, graph);
  const machineSummaryRows = report.machineSummary.map(machineSummaryRow);

  return {
    metrics: [
      metric('Solve status', report.status ? formatStatus(report.status) : 'No result'),
      metric('Power', formatPower(report.powerMw)),
      metric(
        'Recipes',
        formatPlannerInteger(report.activeRecipeGroupCount),
        'active recipe groups',
      ),
      metric(
        'Effective machines',
        `${formatPlannerNumber(report.totalMachineCount)}x`,
        '100% clock equivalent',
      ),
      metric('Raw inputs', formatPlannerInteger(report.rawInputTypeCount), 'resource types'),
      metric('Targets', formatPlannerInteger(report.targetCount), 'configured outputs'),
    ],
    objective: objectiveSummary(report.objective),
    notes: notesSummary(report.notes),
    targets: report.targets.map(targetSummary),
    topRawInputs: report.rawInputs
      .toSorted((left, right) => right.amountPerMinute - left.amountPerMinute)
      .slice(0, MAX_OVERVIEW_RAW_INPUTS)
      .map(itemRateRow),
    externalInputs: report.externalInputs.map(itemRateRow),
    assumedInputs: report.assumedInputs.map(itemRateRow),
    surplus: report.surplus.map(itemRateRow),
    machineSummary: machineSummaryRows.slice(0, MAX_OVERVIEW_MACHINE_ROWS),
    totalPhysicalMachineCountLabel: formatPlannerInteger(report.totalPhysicalMachineCount),
    machineSummaryTotalCount: machineSummaryRows.length,
    hiddenMachineSummaryCount: Math.max(0, machineSummaryRows.length - MAX_OVERVIEW_MACHINE_ROWS),
    warnings: report.warnings.map(warningRow),
  };
}

export function selectNotesSummary(
  project: PlannerProject,
  graph: ProductionGraph | null,
): InspectorNotesSummary {
  return notesSummary(buildPlanNotesSummary(project, graph));
}

function objectiveSummary(report: {
  label: string;
  hasMaximizeTarget: boolean;
}): InspectorObjectiveSummary {
  return {
    label: report.label,
    detail: report.hasMaximizeTarget
      ? 'Maximize targets solve first; this preset breaks route ties.'
      : 'Fixed outputs stay fixed; this preset chooses feasible routes.',
  };
}

function machineSummaryRow(summary: PlanReportMachineSummary): InspectorMachineSummaryRow {
  return {
    machineId: summary.machineId,
    machineDisplayName: summary.machineDisplayName,
    machineIconSrc: gameIconPathForMachineId(summary.machineId),
    machineCountLabel: `${formatPlannerNumber(summary.machineCount)}x`,
    physicalMachineCountLabel: formatPlannerInteger(summary.physicalMachineCount),
    powerLabel: formatPower(summary.powerMw),
    recipeGroupCountLabel: `${formatPlannerInteger(summary.recipeGroupCount)} ${
      summary.recipeGroupCount === 1 ? 'recipe' : 'recipes'
    }`,
  };
}

function selectSelectedNodeViewModel(
  dataset: GameDataset,
  project: PlannerProject,
  result: ProductionPlanResult | null,
  selectedNode: ProductionGraphNode,
  selectedNodeState: GraphNodeBuildState,
): InspectorSelectedNodeViewModel {
  const report = buildSelectedNodeReport(dataset, project, result, selectedNode);
  const details = selectedNodeDetails(report.details, dataset, project);

  return {
    nodeId: report.nodeId,
    kindLabel: nodeKindLabel(report.kind),
    label: report.label,
    subtitle: report.subtitle,
    icon: iconFromRef(report.icon),
    state: selectedNodeState,
    metrics: selectedNodeMetrics(details),
    warnings: report.warnings.map(warningRow),
    incomingFlows: report.incomingFlows.map(flowRow),
    outgoingFlows: report.outgoingFlows.map(flowRow),
    loopbackFlows: report.loopbackFlows.map(flowRow),
    details,
  };
}

function selectedNodeDetails(
  details: SelectedNodeReportDetails,
  dataset: GameDataset,
  project: PlannerProject,
): SelectedNodeDetails {
  switch (details.kind) {
    case 'recipe':
      return recipeNodeDetails(details);
    case 'resource':
      return resourceNodeDetails(details);
    case 'externalInput':
      return externalInputNodeDetails(details);
    case 'assumedInput':
      return assumedInputNodeDetails(details);
    case 'power':
      return powerNodeDetails(details);
    case 'output':
      return outputNodeDetails(details, dataset, project);
    case 'byproduct':
      return byproductNodeDetails(details, dataset, project);
    case 'sink':
      return sinkNodeDetails(details, dataset, project);
  }
}

function recipeNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'recipe' }>,
): RecipeNodeDetails {
  return {
    kind: 'recipe',
    recipeName: details.recipeName,
    machineName: details.machineName,
    machineIcon:
      details.machineId === null
        ? null
        : {
            src: gameIconPathForMachineId(details.machineId),
            label: details.machineName,
            kind: 'machine' as const,
          },
    machineCountLabel: `${formatPlannerNumber(details.machineCount)}x`,
    physicalMachineCountLabel: formatPlannerInteger(details.physicalMachineCount),
    recipeRateLabel: `${formatPlannerNumber(details.recipeRatePerMinute)}/min`,
    powerLabel: details.powerMw === null ? null : formatPower(details.powerMw),
    inputs: details.inputs.map(itemRateRow),
    outputs: details.outputs.map(itemRateRow),
  };
}

function resourceNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'resource' }>,
): ResourceNodeDetails {
  return {
    kind: 'resource',
    item: itemRateRow(details.item),
    capLabel: details.capSource === 'disabled' ? '0/min' : formatResourceCap(details.capPerMinute),
    capSourceLabel: resourceCapSourceLabel(details.capSource),
    headroomLabel:
      details.headroomPerMinute === null
        ? null
        : `${formatPlannerNumber(details.headroomPerMinute)}/min`,
  };
}

function externalInputNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'externalInput' }>,
): ExternalInputNodeDetails {
  return {
    kind: 'externalInput',
    item: itemRateRow(details.item),
    sourceNote: 'Manual supply from another factory.',
  };
}

function assumedInputNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'assumedInput' }>,
): AssumedInputNodeDetails {
  return {
    kind: 'assumedInput',
    item: itemRateRow(details.item),
    sourceNote: details.sourceNote,
  };
}

function powerNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'power' }>,
): PowerNodeDetails {
  return {
    kind: 'power',
    generatorName: details.generatorName,
    generatorIcon:
      details.generatorId === null
        ? null
        : {
            src: gameIconPathForMachineId(details.generatorId),
            label: details.generatorName,
            kind: 'machine',
          },
    generatorCountLabel: `${formatPlannerNumber(details.generatorCount)}x`,
    physicalGeneratorCountLabel: formatPlannerInteger(details.physicalGeneratorCount),
    generatedPowerLabel: formatPower(details.generatedPowerMw),
    fuel: details.fuel === null ? null : itemRateRow(details.fuel),
    supplementalInputs: details.supplementalInputs.map(itemRateRow),
    byproducts: details.byproducts.map(itemRateRow),
  };
}

function outputNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'output' }>,
  dataset: GameDataset,
  project: PlannerProject,
): OutputNodeDetails {
  return {
    kind: 'output',
    item: itemRateRow(details.item),
    targetModeLabel: details.targetMode === 'maximize' ? 'Maximize' : 'Fixed',
    requestedAmountPerMinuteLabel:
      details.requestedAmountPerMinute === null
        ? null
        : `${formatPlannerNumber(details.requestedAmountPerMinute)}/min`,
    solvedAmountPerMinuteLabel:
      details.solvedAmountPerMinute === null
        ? null
        : `${formatPlannerNumber(details.solvedAmountPerMinute)}/min`,
    incomingAmountPerMinuteLabel: `${formatPlannerNumber(details.incomingAmountPerMinute)}/min`,
    fuelPower:
      details.fuelPower === null
        ? null
        : {
            generatorName: generatorName(details.fuelPower.generatorId),
            generatorIcon: {
              src: gameIconPathForMachineId(details.fuelPower.generatorId),
              label: generatorName(details.fuelPower.generatorId),
              kind: 'machine',
            },
            generatorCountLabel: `${formatPlannerNumber(details.fuelPower.generatorCount)}x`,
            grossPowerLabel: formatPower(details.fuelPower.grossPowerMw),
            fuelPerGeneratorLabel: `${formatPlannerNumber(
              details.fuelPower.fuelPerGeneratorPerMinute,
            )}/min each`,
            waste: details.fuelPower.waste === null ? null : itemRateRow(details.fuelPower.waste),
            note: fuelPowerNote(details.fuelPower.noteKind),
          },
    surplusSinkAction: surplusSinkAction(dataset, project, details.item.itemId),
  };
}

function byproductNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'byproduct' }>,
  dataset: GameDataset,
  project: PlannerProject,
): ByproductNodeDetails {
  return {
    kind: 'byproduct',
    item: itemRateRow(details.item),
    sinkPointsPerMinuteLabel:
      details.sinkPointsPerMinute === null
        ? null
        : `${formatPlannerNumber(details.sinkPointsPerMinute)}/min`,
    surplusNote: 'Unused surplus.',
    surplusSinkAction: surplusSinkAction(dataset, project, details.item.itemId),
  };
}

function sinkNodeDetails(
  details: Extract<SelectedNodeReportDetails, { kind: 'sink' }>,
  dataset: GameDataset,
  project: PlannerProject,
): SinkNodeDetails {
  return {
    kind: 'sink',
    item: itemRateRow(details.item),
    sinkPointsPerMinuteLabel: `${formatPlannerNumber(details.sinkPointsPerMinute)}/min`,
    sinkAction: sinkNodeAction(details, dataset, project),
  };
}

function selectedNodeMetrics(details: SelectedNodeDetails): InspectorMetric[] {
  switch (details.kind) {
    case 'recipe':
      return [
        metric('Machine', details.machineName),
        metric('Effective machines', details.machineCountLabel, '100% clock equivalent'),
        metric('Physical machines', details.physicalMachineCountLabel, 'whole machines to place'),
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
    case 'assumedInput':
      return [metric('Supplied', details.item.amountPerMinuteLabel), metric('Source', 'Assumed')];
    case 'power':
      return [
        metric('Generated', details.generatedPowerLabel),
        metric('Generators', details.generatorCountLabel, '100% clock equivalent'),
        metric(
          'Physical generators',
          details.physicalGeneratorCountLabel,
          'whole generators to place',
        ),
        metric('Fuel', details.fuel?.amountPerMinuteLabel ?? '0/min'),
      ];
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
    case 'sink':
      return [
        metric('Sinking', details.item.amountPerMinuteLabel),
        metric('Sink points', details.sinkPointsPerMinuteLabel),
      ];
  }
}

function notesSummary(report: {
  readonly hasPlanNote: boolean;
  readonly planNote: string;
  readonly nodeNotes: readonly PlanReportNodeNoteSummary[];
  readonly visibleNodeNoteCount: number;
  readonly staleNodeNoteCount: number;
}): InspectorNotesSummary {
  return {
    hasPlanNote: report.hasPlanNote,
    planNote: report.planNote,
    nodeNotes: report.nodeNotes.map((note) => ({
      nodeId: note.nodeId,
      label: note.label,
      kindLabel: note.kind === null ? 'Not visible' : nodeKindLabel(note.kind),
      note: note.note,
      visible: note.visible,
      visibilityLabel: note.visible ? 'Visible in graph' : 'Not currently visible',
    })),
    visibleNodeNoteCount: report.visibleNodeNoteCount,
    staleNodeNoteCount: report.staleNodeNoteCount,
  };
}

function targetSummary(target: PlanReportTargetSummary): InspectorTargetSummary {
  return {
    targetId: target.targetId,
    itemId: target.itemId,
    displayName: target.itemDisplayName ?? 'Choose an item',
    iconSrc: target.itemId.length > 0 ? gameIconPathForItemId(target.itemId) : '',
    modeLabel: target.mode === 'maximize' ? 'Maximize' : 'Fixed',
    amountLabel:
      target.mode === 'maximize'
        ? `${formatPlannerNumber(target.amountPerMinute)}/min solved`
        : `${formatPlannerNumber(target.amountPerMinute)}/min requested`,
  };
}

function iconFromRef(icon: PlanReportIconRef | null): InspectorIcon | null {
  if (icon === null) {
    return null;
  }

  return {
    src:
      icon.kind === 'machine' ? gameIconPathForMachineId(icon.id) : gameIconPathForItemId(icon.id),
    label: icon.label,
    kind: icon.kind,
  };
}

function flowRow(flow: PlanReportFlow): InspectorFlowRow {
  return {
    ...itemRateRow(flow),
    flowKey: flow.flowKey,
    endpointKindLabel: endpointKindLabel(flow.endpointKind),
    endpointLabel: flow.endpointLabel,
  };
}

function warningRow(warning: PlanReportWarning): InspectorWarningViewModel {
  return {
    code: warning.code,
    message: warning.message,
    ...(warning.itemId !== undefined ? { itemId: warning.itemId } : {}),
    ...(warning.recipeId !== undefined ? { recipeId: warning.recipeId } : {}),
  };
}

function itemRateRow(rate: PlanReportItemRate): InspectorItemRateRow {
  return {
    itemId: rate.itemId,
    displayName: rate.displayName,
    iconSrc: gameIconPathForItemId(rate.itemId),
    amountPerMinute: rate.amountPerMinute,
    amountPerMinuteLabel: `${formatPlannerNumber(rate.amountPerMinute)}/min`,
    detail: itemRateDetail(rate.role),
  };
}

function itemRateDetail(role: PlanReportItemRateRole | null): string | null {
  switch (role) {
    case null:
      return null;
    case 'required-input':
      return 'required input';
    case 'recipe-output':
      return 'recipe output';
    case 'raw-resource-consumption':
      return 'consumed from raw resources';
    case 'external-input-supply':
      return 'supplied externally';
    case 'assumed-input-supply':
      return 'Modeled as supplied nuclear waste. Add this item in Inputs to replace the assumed source.';
    case 'maximized-output':
      return 'maximized output';
    case 'requested-output':
      return 'requested output';
    case 'unused-surplus':
      return 'unused surplus';
    case 'sink-consumption':
      return 'sent to sink';
    case 'nuclear-byproduct':
      return 'nuclear byproduct';
  }
}

function generatorName(generatorId: MachineId): string {
  switch (generatorId) {
    case 'Build_GeneratorBiomass_Automated_C':
      return 'Biomass Burner';
    case 'Build_GeneratorCoal_C':
      return 'Coal-Powered Generator';
    case 'Build_GeneratorFuel_C':
      return 'Fuel-Powered Generator';
    case 'Build_GeneratorNuclear_C':
      return 'Nuclear Power Plant';
    default:
      return generatorId;
  }
}

function fuelPowerNote(noteKind: OutputFuelPowerNoteKind): string {
  switch (noteKind) {
    case 'biomass-demand-scaled':
      return 'Gross estimate. Biomass Burners scale fuel burn to grid demand.';
    case 'water-logistics-not-modeled':
      return 'Gross estimate. Water logistics are not modeled here.';
    case 'pipe-logistics-not-modeled':
      return 'Gross estimate. Pipe throughput is not modeled here.';
    case 'nuclear-byproducts-shown':
      return 'Gross estimate. Water logistics are not modeled here; nuclear byproducts are shown for planning.';
    case 'clean-ficsonium':
      return 'Gross estimate. Water logistics are not modeled here; Ficsonium Fuel Rods burn clean.';
  }
}

function resourceCapSourceLabel(source: ResourceCapSource): string {
  switch (source) {
    case 'disabled':
      return 'Disabled';
    case 'custom':
      return 'Custom cap';
    case 'default':
      return 'Default cap';
  }
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
    case 'assumedInput':
      return 'Assumed input';
    case 'power':
      return 'Power';
    case 'recipe':
      return 'Recipe';
    case 'output':
      return 'Output';
    case 'byproduct':
      return 'Byproduct';
    case 'sink':
      return 'Sink';
  }
}

function endpointKindLabel(kind: PlanReportFlow['endpointKind']): string {
  switch (kind) {
    case 'resource':
      return 'Resource';
    case 'externalInput':
      return 'External input';
    case 'assumedInput':
      return 'Assumed input';
    case 'power':
      return 'Power';
    case 'recipe':
      return 'Recipe';
    case 'output':
      return 'Output';
    case 'byproduct':
      return 'Byproduct';
    case 'sink':
      return 'Sink';
  }
}

function surplusSinkAction(
  dataset: GameDataset,
  project: PlannerProject,
  itemId: ItemId,
): InspectorSurplusSinkAction | null {
  if (!isSinkableItem(dataset, itemId)) {
    return null;
  }
  const active = surplusSinkRuleForItem(project.sinkRules, itemId) !== undefined;
  return {
    kind: 'surplus',
    itemId,
    active,
    label: active ? 'Remove sink' : 'Sink surplus',
    title: active ? 'Remove surplus sink' : 'Send solved surplus to an Awesome Sink',
  };
}

function sinkNodeAction(
  details: Extract<SelectedNodeReportDetails, { kind: 'sink' }>,
  dataset: GameDataset,
  project: PlannerProject,
): InspectorSinkAction | null {
  if (details.sinkRuleMode === 'mixed') {
    return null;
  }
  if (details.sinkRuleMode === 'target-output' && details.sinkRuleId !== null) {
    return {
      kind: 'remove-rule',
      sinkRuleId: details.sinkRuleId,
      label: 'Remove sink',
      title: 'Remove target output sink',
    };
  }
  return surplusSinkAction(dataset, project, details.item.itemId);
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
