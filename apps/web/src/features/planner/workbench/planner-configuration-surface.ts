import {
  OBJECTIVE_PRESET_DEFINITIONS,
  objectivePresetDefinition,
  resolveObjectivePresetId,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
  type PipelineTier,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';

export type PlannerConfigurationScope = 'plan' | 'defaults';
export type BaseRecipePanelId = 'standard' | 'unlocks' | 'converterResources';
export type DefaultRecipePanelId = BaseRecipePanelId | 'alternates';

export interface ThroughputTierOption<TValue extends ConveyorBeltTier | PipelineTier> {
  readonly value: TValue;
  readonly label: string;
  readonly capacityLabel: string;
}

export interface DisplayOption<TValue extends RateDecimalPlaces | GraphEdgeStyle> {
  readonly value: TValue;
  readonly label: string;
}

export interface ObjectiveWeightControl {
  readonly key: ObjectiveWeightKey;
  readonly label: string;
  readonly step: number;
}

export interface RecipePanelDefinition<TPanelId extends string> {
  readonly id: TPanelId;
  readonly label: string;
}

export interface BaseRecipePanelRows<TRow> {
  readonly standard: readonly TRow[];
  readonly unlocks: readonly TRow[];
  readonly converterResources: readonly TRow[];
}

export interface DefaultRecipePanelRows<TRow> extends BaseRecipePanelRows<TRow> {
  readonly alternates: readonly TRow[];
}

export const GRAPH_DISPLAY_BELT_TIER_OPTIONS = [
  { value: 1, label: 'Mk.1', capacityLabel: '60/min' },
  { value: 2, label: 'Mk.2', capacityLabel: '120/min' },
  { value: 3, label: 'Mk.3', capacityLabel: '270/min' },
  { value: 4, label: 'Mk.4', capacityLabel: '480/min' },
  { value: 5, label: 'Mk.5', capacityLabel: '780/min' },
  { value: 6, label: 'Mk.6', capacityLabel: '1200/min' },
] as const satisfies readonly ThroughputTierOption<ConveyorBeltTier>[];

export const GRAPH_DISPLAY_PIPE_TIER_OPTIONS = [
  { value: 1, label: 'Mk.1', capacityLabel: '300/min' },
  { value: 2, label: 'Mk.2', capacityLabel: '600/min' },
] as const satisfies readonly ThroughputTierOption<PipelineTier>[];

export const GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS = [
  { value: 1, label: '1 decimal' },
  { value: 2, label: '2 decimals' },
  { value: 3, label: '3 decimals' },
  { value: 4, label: '4 decimals' },
] as const satisfies readonly DisplayOption<RateDecimalPlaces>[];

export const GRAPH_DISPLAY_EDGE_STYLE_OPTIONS = [
  { value: 'straight', label: 'Straight lines' },
  { value: 'curved', label: 'Curved lines' },
] as const satisfies readonly DisplayOption<GraphEdgeStyle>[];

export const PLANNER_OBJECTIVE_PRESETS = OBJECTIVE_PRESET_DEFINITIONS;

export const RAW_RESOURCE_COST_FORMULA_LABEL =
  'Built-in cost x custom multiplier = effective cost.';
export const RAW_RESOURCE_COST_HELP_TEXT =
  'Built-in cost uses static map availability: scarcer resources start higher. Custom multiplier is your preference; the solver uses effective cost when choosing among feasible routes.';

export const OBJECTIVE_WEIGHT_CONTROLS = [
  { key: 'resourceScarcityWeight', label: 'Raw resources', step: 0.05 },
  { key: 'powerWeight', label: 'Power', step: 0.05 },
  { key: 'machineCountWeight', label: 'Machines', step: 0.05 },
  { key: 'surplusWeight', label: 'Surplus', step: 0.05 },
] as const satisfies readonly ObjectiveWeightControl[];

export const BASE_RECIPE_PANEL_DEFINITIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'unlocks', label: 'Unlocks' },
  { id: 'converterResources', label: 'Converter' },
] as const satisfies readonly RecipePanelDefinition<BaseRecipePanelId>[];

export const DEFAULT_RECIPE_PANEL_DEFINITIONS = [
  ...BASE_RECIPE_PANEL_DEFINITIONS,
  { id: 'alternates', label: 'Alternates' },
] as const satisfies readonly RecipePanelDefinition<DefaultRecipePanelId>[];

export function activeObjectivePresetId(profile: ObjectiveProfile): ObjectivePresetId {
  return resolveObjectivePresetId(profile);
}

export function activeObjectivePresetLabel(profile: ObjectiveProfile): string {
  return objectivePresetDefinition(activeObjectivePresetId(profile)).label;
}

export function activeObjectivePresetDescription(profile: ObjectiveProfile): string {
  return objectivePresetDefinition(activeObjectivePresetId(profile)).description;
}

export function objectiveWeightValue(profile: ObjectiveProfile, key: ObjectiveWeightKey): number {
  return profile[key];
}

export function recipeRowsForBasePanel<TRow>(
  panelId: BaseRecipePanelId,
  rows: BaseRecipePanelRows<TRow>,
): readonly TRow[] {
  switch (panelId) {
    case 'unlocks':
      return rows.unlocks;
    case 'converterResources':
      return rows.converterResources;
    case 'standard':
      return rows.standard;
  }
}

export function recipeRowsForDefaultPanel<TRow>(
  panelId: DefaultRecipePanelId,
  rows: DefaultRecipePanelRows<TRow>,
): readonly TRow[] {
  switch (panelId) {
    case 'unlocks':
      return rows.unlocks;
    case 'converterResources':
      return rows.converterResources;
    case 'alternates':
      return rows.alternates;
    case 'standard':
      return rows.standard;
  }
}
