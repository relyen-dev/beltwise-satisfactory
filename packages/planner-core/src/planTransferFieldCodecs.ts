import type { ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import type { Point } from './model';
import type {
  ConveyorBeltTier,
  GraphDisplaySettings,
  GraphEdgeStyle,
  GraphLayoutState,
  GraphNodeBuildState,
  ItemInputOverride,
  MachineOverride,
  ObjectivePresetId,
  ObjectiveStageId,
  ObjectiveStrategy,
  PipelineTier,
  PlanBuildState,
  ProductTarget,
  RateDecimalPlaces,
  RecipeOverride,
  ResourceOverride,
  SinkRule,
} from './plan';

export type PlanTransferRecord = Record<string, unknown>;

const UNSAFE_TRANSFER_RECORD_KEYS = new Set([
  '__proto__',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype),
]);

export interface BooleanOverrideEntry<Id extends string = string> {
  id: Id;
  enabled: boolean;
}

export interface AmountOverrideEntry<Id extends string = ItemId> {
  id: Id;
  amountPerMinute: number;
}

export interface ResourceOverrideEntry<Id extends string = ItemId> {
  id: Id;
  enabled?: boolean;
  maxPerMinute?: number;
}

export interface GraphNodePositionEntry {
  nodeId: string;
  x: number;
  y: number;
}

export function isPlanTransferRecord(value: unknown): value is PlanTransferRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSafePlanTransferRecordKey(key: string): boolean {
  return !UNSAFE_TRANSFER_RECORD_KEYS.has(key);
}

export function readSafePlanTransferRecordKey(value: unknown): string | undefined {
  const key = readTransferString(value);
  return key !== undefined && isSafePlanTransferRecordKey(key) ? key : undefined;
}

export function readTransferString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readTransferFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readTransferNonNegativeFiniteNumber(value: unknown): number | undefined {
  const number = readTransferFiniteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

export function normalizePlanTransferNote(note: string): string {
  return note.trim().length > 0 ? note : '';
}

export function readPlanTransferNote(value: unknown): string {
  return typeof value === 'string' ? normalizePlanTransferNote(value) : '';
}

export function copyProductTargetForTransfer(target: ProductTarget): ProductTarget {
  return target.amountPerMinute === undefined
    ? {
        id: target.id,
        itemId: target.itemId,
        mode: target.mode,
        sortOrder: target.sortOrder,
      }
    : {
        id: target.id,
        itemId: target.itemId,
        mode: target.mode,
        amountPerMinute: target.amountPerMinute,
        sortOrder: target.sortOrder,
      };
}

export function copySinkRuleForTransfer(rule: SinkRule): SinkRule {
  return {
    id: rule.id,
    itemId: rule.itemId,
    mode: rule.mode,
    sortOrder: rule.sortOrder,
  };
}

export function copySinkRulesForTransfer(rules: readonly SinkRule[]): SinkRule[] {
  return rules.map(copySinkRuleForTransfer);
}

export function readProductTargetsForTransfer(
  value: unknown,
  createTargetId: () => string,
): ProductTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const targets: ProductTarget[] = [];
  for (const [index, target] of value.entries()) {
    if (!isPlanTransferRecord(target)) {
      continue;
    }

    const itemId = readTransferTargetItemId(target['itemId']);
    const mode = target['mode'];
    if (itemId === undefined || (mode !== 'fixed' && mode !== 'maximize')) {
      continue;
    }

    const baseTarget = {
      id: readSafePlanTransferRecordKey(target['id']) ?? createTargetId(),
      itemId,
      mode,
      sortOrder: readTransferFiniteNumber(target['sortOrder']) ?? index,
    };

    if (mode === 'fixed') {
      targets.push({
        ...baseTarget,
        mode,
        amountPerMinute: Math.max(0, readTransferFiniteNumber(target['amountPerMinute']) ?? 0),
      });
      continue;
    }

    targets.push({
      ...baseTarget,
      mode,
    });
  }
  return targets;
}

export function readSinkRulesForTransfer(
  value: unknown,
  createRuleId: () => string,
): SinkRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rules: SinkRule[] = [];
  const seenItemIds = new Set<ItemId>();
  for (const [index, rule] of value.entries()) {
    if (!isPlanTransferRecord(rule)) {
      continue;
    }

    const itemId = readTransferTargetItemId(rule['itemId']);
    if (
      itemId === undefined ||
      itemId.length === 0 ||
      seenItemIds.has(itemId) ||
      rule['mode'] !== 'surplus'
    ) {
      continue;
    }
    seenItemIds.add(itemId);
    rules.push({
      id: readSafePlanTransferRecordKey(rule['id']) ?? createRuleId(),
      itemId,
      mode: 'surplus',
      sortOrder: readTransferFiniteNumber(rule['sortOrder']) ?? index,
    });
  }

  return rules
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((rule, index) => ({ ...rule, sortOrder: index }));
}

export function copyRecipeOverridesForTransfer(
  recipeOverrides: Record<RecipeId, RecipeOverride>,
): Record<RecipeId, RecipeOverride> {
  return copyBooleanOverridesForTransfer(recipeOverrides);
}

export function copyMachineOverridesForTransfer(
  machineOverrides: Record<MachineId, MachineOverride>,
): Record<MachineId, MachineOverride> {
  return copyBooleanOverridesForTransfer(machineOverrides);
}

export function copyBooleanOverridesForTransfer<Id extends string>(
  overrides: Record<Id, { enabled: boolean }>,
): Record<Id, { enabled: boolean }> {
  const copy: Record<Id, { enabled: boolean }> = {} as Record<Id, { enabled: boolean }>;
  for (const [id, override] of typedEntries(overrides)) {
    copy[id] = { enabled: override.enabled };
  }
  return copy;
}

export function booleanOverrideEntriesForTransfer<Id extends string>(
  overrides: Record<Id, { enabled: boolean }>,
  defaults: Record<Id, { enabled: boolean }>,
  implicitDefaultEnabled: boolean,
): BooleanOverrideEntry<Id>[] {
  return typedEntries(overrides)
    .filter(
      ([id, override]) => override.enabled !== (defaults[id]?.enabled ?? implicitDefaultEnabled),
    )
    .map(([id, override]) => ({ id, enabled: override.enabled }));
}

export function readRecipeOverridesForTransfer(value: unknown): Record<RecipeId, RecipeOverride> {
  return readBooleanOverridesForTransfer(value);
}

export function readMachineOverridesForTransfer(
  value: unknown,
): Record<MachineId, MachineOverride> {
  return readBooleanOverridesForTransfer(value);
}

export function readBooleanOverridesForTransfer<Id extends string>(
  value: unknown,
): Record<Id, { enabled: boolean }> {
  const overrides: Record<Id, { enabled: boolean }> = {} as Record<Id, { enabled: boolean }>;
  if (!isPlanTransferRecord(value)) {
    return overrides;
  }

  for (const [id, override] of Object.entries(value)) {
    if (!isSafePlanTransferRecordKey(id)) {
      continue;
    }
    if (!isPlanTransferRecord(override) || typeof override['enabled'] !== 'boolean') {
      continue;
    }
    overrides[id as Id] = { enabled: override['enabled'] };
  }
  return overrides;
}

export function copyResourceOverridesForTransfer(
  resourceOverrides: Record<ItemId, ResourceOverride>,
): Record<ItemId, ResourceOverride> {
  const copy: Record<ItemId, ResourceOverride> = {};
  for (const [itemId, override] of Object.entries(resourceOverrides)) {
    copy[itemId] = {
      ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
      ...(override.maxPerMinute !== undefined ? { maxPerMinute: override.maxPerMinute } : {}),
    };
  }
  return copy;
}

export function resourceOverrideEntriesForTransfer(
  overrides: Record<ItemId, ResourceOverride>,
  options: { omitEnabledWhenTrue: boolean },
): ResourceOverrideEntry[] {
  return Object.entries(overrides)
    .map(([itemId, override]) => ({
      id: itemId,
      ...(override.enabled !== undefined &&
      (!options.omitEnabledWhenTrue || override.enabled !== true)
        ? { enabled: override.enabled }
        : {}),
      ...(override.maxPerMinute !== undefined ? { maxPerMinute: override.maxPerMinute } : {}),
    }))
    .filter((override) => override.enabled !== undefined || override.maxPerMinute !== undefined);
}

export function readResourceOverridesForTransfer(value: unknown): Record<ItemId, ResourceOverride> {
  const overrides: Record<ItemId, ResourceOverride> = {};
  if (!isPlanTransferRecord(value)) {
    return overrides;
  }

  for (const [itemId, override] of Object.entries(value)) {
    if (!isSafePlanTransferRecordKey(itemId)) {
      continue;
    }
    if (!isPlanTransferRecord(override)) {
      continue;
    }
    const enabled = typeof override['enabled'] === 'boolean' ? override['enabled'] : undefined;
    const maxPerMinute = readTransferFiniteNumber(override['maxPerMinute']);
    if (enabled === undefined && maxPerMinute === undefined) {
      continue;
    }
    overrides[itemId] = {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(maxPerMinute !== undefined ? { maxPerMinute: Math.max(0, maxPerMinute) } : {}),
    };
  }
  return overrides;
}

export function copyItemInputsForTransfer(
  itemInputs: Record<ItemId, ItemInputOverride>,
): Record<ItemId, ItemInputOverride> {
  const copy: Record<ItemId, ItemInputOverride> = {};
  for (const [itemId, input] of Object.entries(itemInputs)) {
    copy[itemId] = { amountPerMinute: input.amountPerMinute };
  }
  return copy;
}

export function amountOverrideEntriesForTransfer<Id extends string>(
  overrides: Record<Id, { amountPerMinute: number }>,
): AmountOverrideEntry<Id>[] {
  return typedEntries(overrides).map(([id, override]) => ({
    id,
    amountPerMinute: override.amountPerMinute,
  }));
}

export function readItemInputsForTransfer(value: unknown): Record<ItemId, ItemInputOverride> {
  const inputs: Record<ItemId, ItemInputOverride> = {};
  if (!isPlanTransferRecord(value)) {
    return inputs;
  }

  for (const [itemId, input] of Object.entries(value)) {
    if (!isSafePlanTransferRecordKey(itemId)) {
      continue;
    }
    if (!isPlanTransferRecord(input)) {
      continue;
    }
    const amountPerMinute = readTransferFiniteNumber(input['amountPerMinute']);
    if (amountPerMinute === undefined) {
      continue;
    }
    inputs[itemId] = { amountPerMinute: Math.max(0, amountPerMinute) };
  }
  return inputs;
}

export function copyNumberRecordForTransfer(
  value: Readonly<Record<ItemId, number>>,
): Record<ItemId, number> {
  const copy: Record<ItemId, number> = {};
  for (const [itemId, number] of Object.entries(value)) {
    copy[itemId] = sanitizeTransferWeight(number);
  }
  return copy;
}

export function readNumberRecordForTransfer(value: unknown): Record<ItemId, number> {
  const record: Record<ItemId, number> = {};
  if (!isPlanTransferRecord(value)) {
    return record;
  }

  for (const [itemId, multiplier] of Object.entries(value)) {
    if (!isSafePlanTransferRecordKey(itemId)) {
      continue;
    }
    const numericMultiplier = readTransferNonNegativeFiniteNumber(multiplier);
    if (numericMultiplier !== undefined) {
      record[itemId] = numericMultiplier;
    }
  }
  return record;
}

export function copyGraphLayoutNodePositionsForTransfer(
  nodePositions: GraphLayoutState['nodePositions'],
): GraphLayoutState['nodePositions'] {
  const copy: GraphLayoutState['nodePositions'] = {};
  for (const [nodeId, position] of Object.entries(nodePositions)) {
    copy[nodeId] = { x: position.x, y: position.y };
  }
  return copy;
}

export function graphNodePositionEntriesForTransfer(
  nodePositions: GraphLayoutState['nodePositions'],
): GraphNodePositionEntry[] {
  return Object.entries(nodePositions).map(([nodeId, position]) => ({
    nodeId,
    x: position.x,
    y: position.y,
  }));
}

export function readGraphLayoutForTransfer(value: unknown): GraphLayoutState {
  if (!isPlanTransferRecord(value) || !isPlanTransferRecord(value['nodePositions'])) {
    return { nodePositions: {} };
  }

  const nodePositions: GraphLayoutState['nodePositions'] = {};
  for (const [nodeId, position] of Object.entries(value['nodePositions'])) {
    if (!isSafePlanTransferRecordKey(nodeId)) {
      continue;
    }
    const point = readPointForTransfer(position);
    if (point !== null) {
      nodePositions[nodeId] = point;
    }
  }
  return { nodePositions };
}

export function copyGraphDisplaySettingsForTransfer(
  settings: GraphDisplaySettings,
): GraphDisplaySettings {
  return {
    maxBeltTier: settings.maxBeltTier,
    maxPipeTier: settings.maxPipeTier,
    rateDecimalPlaces: settings.rateDecimalPlaces,
    edgeStyle: settings.edgeStyle,
    showTransportLabels: settings.showTransportLabels,
    animateFlowLines: settings.animateFlowLines,
  };
}

export function readGraphDisplaySettingsForTransfer(
  value: unknown,
  defaults: GraphDisplaySettings,
): GraphDisplaySettings {
  if (!isPlanTransferRecord(value)) {
    return { ...defaults };
  }

  return {
    maxBeltTier: readTransferConveyorBeltTier(value['maxBeltTier']) ?? defaults.maxBeltTier,
    maxPipeTier: readTransferPipelineTier(value['maxPipeTier']) ?? defaults.maxPipeTier,
    rateDecimalPlaces:
      readTransferRateDecimalPlaces(value['rateDecimalPlaces']) ?? defaults.rateDecimalPlaces,
    edgeStyle: readTransferGraphEdgeStyle(value['edgeStyle']) ?? defaults.edgeStyle,
    showTransportLabels:
      typeof value['showTransportLabels'] === 'boolean'
        ? value['showTransportLabels']
        : defaults.showTransportLabels,
    animateFlowLines:
      typeof value['animateFlowLines'] === 'boolean'
        ? value['animateFlowLines']
        : defaults.animateFlowLines,
  };
}

export function copyPlanBuildStateForTransfer(buildState: PlanBuildState): PlanBuildState {
  return {
    planLocked: buildState.planLocked,
    nodeLayoutLocked: buildState.nodeLayoutLocked,
    nodeStates: copyGraphNodeBuildStatesForTransfer(buildState.nodeStates),
  };
}

export function copyGraphNodeBuildStatesForTransfer(
  nodeStates: Record<string, GraphNodeBuildState>,
): Record<string, GraphNodeBuildState> {
  const copy: Record<string, GraphNodeBuildState> = {};
  for (const [nodeId, nodeState] of Object.entries(nodeStates)) {
    const copiedNodeState = copyGraphNodeBuildStateForTransfer(nodeState);
    if (copiedNodeState !== null) {
      copy[nodeId] = copiedNodeState;
    }
  }
  return copy;
}

export function copyGraphNodeBuildStateForTransfer(
  nodeState: GraphNodeBuildState,
): GraphNodeBuildState | null {
  const copiedNodeState: GraphNodeBuildState = {};
  if (nodeState.done !== undefined) {
    copiedNodeState.done = nodeState.done;
  }
  if (nodeState.note !== undefined) {
    const note = normalizePlanTransferNote(nodeState.note);
    if (note.length > 0) {
      copiedNodeState.note = note;
    }
  }
  return copiedNodeState.done !== undefined || copiedNodeState.note !== undefined
    ? copiedNodeState
    : null;
}

export function readBuildStateForTransfer(value: unknown): PlanBuildState {
  if (!isPlanTransferRecord(value)) {
    return { planLocked: false, nodeLayoutLocked: false, nodeStates: {} };
  }

  return {
    planLocked: value['planLocked'] === true || value['locked'] === true,
    nodeLayoutLocked: value['nodeLayoutLocked'] === true,
    nodeStates: readGraphNodeStatesForTransfer(value['nodeStates']),
  };
}

export function readGraphNodeStatesForTransfer(
  value: unknown,
): Record<string, GraphNodeBuildState> {
  const nodeStates: Record<string, GraphNodeBuildState> = {};
  if (!isPlanTransferRecord(value)) {
    return nodeStates;
  }

  for (const [nodeId, nodeState] of Object.entries(value)) {
    if (!isSafePlanTransferRecordKey(nodeId)) {
      continue;
    }
    if (!isPlanTransferRecord(nodeState)) {
      continue;
    }
    const done = typeof nodeState['done'] === 'boolean' ? nodeState['done'] : undefined;
    const normalizedNote =
      typeof nodeState['note'] === 'string' ? normalizePlanTransferNote(nodeState['note']) : '';
    const note = normalizedNote.length > 0 ? normalizedNote : undefined;
    if (done === undefined && note === undefined) {
      continue;
    }
    nodeStates[nodeId] = {
      ...(done !== undefined ? { done } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  }
  return nodeStates;
}

export function sanitizeTransferWeight(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export function readTransferConveyorBeltTier(value: unknown): ConveyorBeltTier | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6
    ? value
    : undefined;
}

export function readTransferPipelineTier(value: unknown): PipelineTier | undefined {
  return value === 1 || value === 2 ? value : undefined;
}

export function readTransferRateDecimalPlaces(value: unknown): RateDecimalPlaces | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;
}

export function readTransferGraphEdgeStyle(value: unknown): GraphEdgeStyle | undefined {
  return value === 'straight' || value === 'curved' ? value : undefined;
}

export function readTransferObjectivePresetId(value: unknown): ObjectivePresetId | undefined {
  return value === 'resource-efficient' ||
    value === 'low-power' ||
    value === 'few-machines' ||
    value === 'low-surplus' ||
    value === 'balanced' ||
    value === 'custom'
    ? value
    : undefined;
}

export function readTransferObjectiveStrategy(value: unknown): ObjectiveStrategy | undefined {
  return value === 'lexicographic' || value === 'weighted' ? value : undefined;
}

export function readTransferObjectiveStageId(value: unknown): ObjectiveStageId | undefined {
  return value === 'raw-resources' ||
    value === 'surplus' ||
    value === 'recipe-activity' ||
    value === 'power'
    ? value
    : undefined;
}

export function readTransferObjectiveStageOrder(value: unknown): ObjectiveStageId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const stageOrder: ObjectiveStageId[] = [];
  for (const item of value) {
    const stageId = readTransferObjectiveStageId(item);
    if (stageId === undefined) {
      return undefined;
    }
    if (!stageOrder.includes(stageId)) {
      stageOrder.push(stageId);
    }
  }
  return stageOrder.length > 0 ? stageOrder : undefined;
}

export function objectiveStageOrdersEqual(
  left: readonly ObjectiveStageId[],
  right: readonly ObjectiveStageId[],
): boolean {
  return left.length === right.length && left.every((stageId, index) => stageId === right[index]);
}

function readTransferTargetItemId(value: unknown): ItemId | undefined {
  return typeof value === 'string' && isSafePlanTransferRecordKey(value) ? value : undefined;
}

function readPointForTransfer(value: unknown): Point | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const x = readTransferFiniteNumber(value['x']);
  const y = readTransferFiniteNumber(value['y']);
  return x !== undefined && y !== undefined ? { x, y } : null;
}

function typedEntries<Id extends string, Value>(record: Record<Id, Value>): [Id, Value][] {
  return Object.entries(record) as [Id, Value][];
}
