import { type WritableSignal } from '@angular/core';
import { type PlannerStoreViewSelectors } from './planner-store-view-selectors';

export interface PlannerStoreWorkbenchViews {
  readonly defaultRecipeSearch: WritableSignal<string>;
  readonly defaultResourceRows: PlannerStoreViewSelectors['defaultResourceRows'];
  readonly defaultRawResourceMultiplierRows: PlannerStoreViewSelectors['defaultRawResourceMultiplierRows'];
  readonly defaultMachineRows: PlannerStoreViewSelectors['defaultMachineRows'];
  readonly defaultRecipeRows: PlannerStoreViewSelectors['defaultRecipeRows'];
  readonly defaultBaseRecipeRows: PlannerStoreViewSelectors['defaultBaseRecipeRows'];
  readonly defaultStandardBaseRecipeRows: PlannerStoreViewSelectors['defaultStandardBaseRecipeRows'];
  readonly defaultConverterResourceRecipeRows: PlannerStoreViewSelectors['defaultConverterResourceRecipeRows'];
  readonly defaultAlternateRecipeRows: PlannerStoreViewSelectors['defaultAlternateRecipeRows'];
  readonly defaultGraphDisplaySettings: PlannerStoreViewSelectors['defaultGraphDisplaySettings'];
}

export interface PlannerStoreViewSurface {
  readonly workbench: PlannerStoreWorkbenchViews;
}

interface PlannerStoreViewSurfaceOptions {
  readonly selectors: PlannerStoreViewSelectors;
  readonly defaultRecipeSearch: WritableSignal<string>;
}

export function createPlannerStoreViewSurface(
  options: PlannerStoreViewSurfaceOptions,
): PlannerStoreViewSurface {
  return {
    workbench: createPlannerStoreWorkbenchViews(options),
  };
}

function createPlannerStoreWorkbenchViews(
  options: PlannerStoreViewSurfaceOptions,
): PlannerStoreWorkbenchViews {
  const selectors = options.selectors;
  return {
    defaultRecipeSearch: options.defaultRecipeSearch,
    defaultResourceRows: selectors.defaultResourceRows,
    defaultRawResourceMultiplierRows: selectors.defaultRawResourceMultiplierRows,
    defaultMachineRows: selectors.defaultMachineRows,
    defaultRecipeRows: selectors.defaultRecipeRows,
    defaultBaseRecipeRows: selectors.defaultBaseRecipeRows,
    defaultStandardBaseRecipeRows: selectors.defaultStandardBaseRecipeRows,
    defaultConverterResourceRecipeRows: selectors.defaultConverterResourceRecipeRows,
    defaultAlternateRecipeRows: selectors.defaultAlternateRecipeRows,
    defaultGraphDisplaySettings: selectors.defaultGraphDisplaySettings,
  };
}
