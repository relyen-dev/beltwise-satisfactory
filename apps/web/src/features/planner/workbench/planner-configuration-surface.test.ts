import {
  createCustomObjectiveProfile,
  createObjectiveProfileFromPreset,
} from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import {
  activeObjectivePresetDescription,
  activeObjectivePresetId,
  activeObjectivePresetLabel,
  BASE_RECIPE_PANEL_DEFINITIONS,
  DEFAULT_RECIPE_PANEL_DEFINITIONS,
  GRAPH_DISPLAY_BELT_TIER_OPTIONS,
  GRAPH_DISPLAY_EDGE_STYLE_OPTIONS,
  GRAPH_DISPLAY_PIPE_TIER_OPTIONS,
  GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS,
  objectiveWeightValue,
  OBJECTIVE_WEIGHT_CONTROLS,
  RAW_RESOURCE_COST_FORMULA_LABEL,
  RAW_RESOURCE_COST_HELP_TEXT,
  recipeRowsForBasePanel,
  recipeRowsForDefaultPanel,
} from './planner-configuration-surface';

describe('planner configuration surface', () => {
  it('defines shared graph display options with existing labels', () => {
    expect(GRAPH_DISPLAY_BELT_TIER_OPTIONS).toEqual([
      { value: 1, label: 'Mk.1', capacityLabel: '60/min' },
      { value: 2, label: 'Mk.2', capacityLabel: '120/min' },
      { value: 3, label: 'Mk.3', capacityLabel: '270/min' },
      { value: 4, label: 'Mk.4', capacityLabel: '480/min' },
      { value: 5, label: 'Mk.5', capacityLabel: '780/min' },
      { value: 6, label: 'Mk.6', capacityLabel: '1200/min' },
    ]);
    expect(GRAPH_DISPLAY_PIPE_TIER_OPTIONS).toEqual([
      { value: 1, label: 'Mk.1', capacityLabel: '300/min' },
      { value: 2, label: 'Mk.2', capacityLabel: '600/min' },
    ]);
    expect(GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS).toEqual([
      { value: 1, label: '1 decimal' },
      { value: 2, label: '2 decimals' },
      { value: 3, label: '3 decimals' },
      { value: 4, label: '4 decimals' },
    ]);
    expect(GRAPH_DISPLAY_EDGE_STYLE_OPTIONS).toEqual([
      { value: 'straight', label: 'Straight lines' },
      { value: 'curved', label: 'Curved lines' },
    ]);
  });

  it('defines shared objective weight controls in planner order', () => {
    expect(RAW_RESOURCE_COST_FORMULA_LABEL).toBe(
      'Built-in cost x custom multiplier = effective cost.',
    );
    expect(RAW_RESOURCE_COST_HELP_TEXT).toBe(
      'Built-in cost uses static map availability: scarcer resources start higher. Custom multiplier is your preference; the solver uses effective cost when choosing among feasible routes.',
    );
    expect(OBJECTIVE_WEIGHT_CONTROLS).toEqual([
      { key: 'resourceScarcityWeight', label: 'Raw resources', step: 0.05 },
      { key: 'powerWeight', label: 'Power', step: 0.05 },
      { key: 'machineCountWeight', label: 'Machines', step: 0.05 },
      { key: 'surplusWeight', label: 'Surplus', step: 0.05 },
    ]);
  });

  it('resolves objective preset copy and custom weight values', () => {
    const lowPower = createObjectiveProfileFromPreset('low-power');
    const custom = createCustomObjectiveProfile(lowPower, { powerWeight: 2.5 });

    expect(activeObjectivePresetId(lowPower)).toBe('low-power');
    expect(activeObjectivePresetLabel(lowPower)).toBe('Low Power');
    expect(activeObjectivePresetDescription(lowPower)).toBe(
      'Prefer lower-power routes, then resolve ties with raw resources and surplus.',
    );
    expect(activeObjectivePresetId(custom)).toBe('custom');
    expect(activeObjectivePresetLabel(custom)).toBe('Custom');
    expect(objectiveWeightValue(custom, 'powerWeight')).toBe(2.5);
  });

  it('defines and selects shared recipe panel categories', () => {
    const standardRows = ['standard-a'];
    const converterRows = ['converter-a'];
    const alternateRows = ['alternate-a'];

    expect(BASE_RECIPE_PANEL_DEFINITIONS).toEqual([
      { id: 'standard', label: 'Standard' },
      { id: 'converterResources', label: 'Converter resources' },
    ]);
    expect(DEFAULT_RECIPE_PANEL_DEFINITIONS).toEqual([
      { id: 'standard', label: 'Standard' },
      { id: 'converterResources', label: 'Converter resources' },
      { id: 'alternates', label: 'Alternates' },
    ]);

    expect(
      recipeRowsForBasePanel('standard', {
        standard: standardRows,
        converterResources: converterRows,
      }),
    ).toBe(standardRows);
    expect(
      recipeRowsForDefaultPanel('converterResources', {
        standard: standardRows,
        converterResources: converterRows,
        alternates: alternateRows,
      }),
    ).toBe(converterRows);
    expect(
      recipeRowsForDefaultPanel('alternates', {
        standard: standardRows,
        converterResources: converterRows,
        alternates: alternateRows,
      }),
    ).toBe(alternateRows);
  });
});
