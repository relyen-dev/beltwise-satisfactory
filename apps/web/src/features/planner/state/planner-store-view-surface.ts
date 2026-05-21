import { type Signal, type WritableSignal } from '@angular/core';
import { type PlannerStoreViewSelectors } from './planner-store-view-selectors';

export interface PlannerStoreWorkbenchViews {
  readonly recipeSearch: WritableSignal<string>;
  readonly defaultRecipeSearch: WritableSignal<string>;
  readonly itemOptions: PlannerStoreViewSelectors['itemOptions'];
  readonly resourceRows: PlannerStoreViewSelectors['resourceRows'];
  readonly defaultResourceRows: PlannerStoreViewSelectors['defaultResourceRows'];
  readonly rawResourceMultiplierRows: PlannerStoreViewSelectors['rawResourceMultiplierRows'];
  readonly defaultRawResourceMultiplierRows: PlannerStoreViewSelectors['defaultRawResourceMultiplierRows'];
  readonly externalInputRows: PlannerStoreViewSelectors['externalInputRows'];
  readonly machineRows: PlannerStoreViewSelectors['machineRows'];
  readonly defaultMachineRows: PlannerStoreViewSelectors['defaultMachineRows'];
  readonly machinePanelSummary: PlannerStoreViewSelectors['machinePanelSummary'];
  readonly machineUsageRows: PlannerStoreViewSelectors['machineUsageRows'];
  readonly recipeRows: PlannerStoreViewSelectors['recipeRows'];
  readonly defaultRecipeRows: PlannerStoreViewSelectors['defaultRecipeRows'];
  readonly baseRecipeRows: PlannerStoreViewSelectors['baseRecipeRows'];
  readonly defaultBaseRecipeRows: PlannerStoreViewSelectors['defaultBaseRecipeRows'];
  readonly standardBaseRecipeRows: PlannerStoreViewSelectors['standardBaseRecipeRows'];
  readonly defaultStandardBaseRecipeRows: PlannerStoreViewSelectors['defaultStandardBaseRecipeRows'];
  readonly converterResourceRecipeRows: PlannerStoreViewSelectors['converterResourceRecipeRows'];
  readonly defaultConverterResourceRecipeRows: PlannerStoreViewSelectors['defaultConverterResourceRecipeRows'];
  readonly alternateRecipeRows: PlannerStoreViewSelectors['alternateRecipeRows'];
  readonly defaultAlternateRecipeRows: PlannerStoreViewSelectors['defaultAlternateRecipeRows'];
  readonly graphDisplaySettings: PlannerStoreViewSelectors['graphDisplaySettings'];
  readonly defaultGraphDisplaySettings: PlannerStoreViewSelectors['defaultGraphDisplaySettings'];
}

export interface PlannerStoreGraphView {
  readonly selectedGraphNodeId: Signal<string | null>;
  readonly graph: PlannerStoreViewSelectors['graph'];
  readonly planLocked: PlannerStoreViewSelectors['planLocked'];
  readonly nodeLayoutLocked: PlannerStoreViewSelectors['nodeLayoutLocked'];
  readonly completedGraphNodeIds: PlannerStoreViewSelectors['completedGraphNodeIds'];
  readonly graphNodeNotes: PlannerStoreViewSelectors['graphNodeNotes'];
  readonly selectedGraphNode: PlannerStoreViewSelectors['selectedGraphNode'];
  readonly selectedGraphNodeState: PlannerStoreViewSelectors['selectedGraphNodeState'];
  readonly inspectorViewModel: PlannerStoreViewSelectors['inspectorViewModel'];
}

export interface PlannerStoreViewSurface {
  readonly workbench: PlannerStoreWorkbenchViews;
  readonly graph: PlannerStoreGraphView;
}

interface PlannerStoreViewSurfaceOptions {
  readonly selectors: PlannerStoreViewSelectors;
  readonly recipeSearch: WritableSignal<string>;
  readonly defaultRecipeSearch: WritableSignal<string>;
  readonly selectedGraphNodeId: Signal<string | null>;
}

export function createPlannerStoreViewSurface(
  options: PlannerStoreViewSurfaceOptions,
): PlannerStoreViewSurface {
  return {
    workbench: createPlannerStoreWorkbenchViews(options),
    graph: createPlannerStoreGraphView(options),
  };
}

function createPlannerStoreWorkbenchViews(
  options: PlannerStoreViewSurfaceOptions,
): PlannerStoreWorkbenchViews {
  const selectors = options.selectors;
  return {
    recipeSearch: options.recipeSearch,
    defaultRecipeSearch: options.defaultRecipeSearch,
    itemOptions: selectors.itemOptions,
    resourceRows: selectors.resourceRows,
    defaultResourceRows: selectors.defaultResourceRows,
    rawResourceMultiplierRows: selectors.rawResourceMultiplierRows,
    defaultRawResourceMultiplierRows: selectors.defaultRawResourceMultiplierRows,
    externalInputRows: selectors.externalInputRows,
    machineRows: selectors.machineRows,
    defaultMachineRows: selectors.defaultMachineRows,
    machinePanelSummary: selectors.machinePanelSummary,
    machineUsageRows: selectors.machineUsageRows,
    recipeRows: selectors.recipeRows,
    defaultRecipeRows: selectors.defaultRecipeRows,
    baseRecipeRows: selectors.baseRecipeRows,
    defaultBaseRecipeRows: selectors.defaultBaseRecipeRows,
    standardBaseRecipeRows: selectors.standardBaseRecipeRows,
    defaultStandardBaseRecipeRows: selectors.defaultStandardBaseRecipeRows,
    converterResourceRecipeRows: selectors.converterResourceRecipeRows,
    defaultConverterResourceRecipeRows: selectors.defaultConverterResourceRecipeRows,
    alternateRecipeRows: selectors.alternateRecipeRows,
    defaultAlternateRecipeRows: selectors.defaultAlternateRecipeRows,
    graphDisplaySettings: selectors.graphDisplaySettings,
    defaultGraphDisplaySettings: selectors.defaultGraphDisplaySettings,
  };
}

function createPlannerStoreGraphView(
  options: PlannerStoreViewSurfaceOptions,
): PlannerStoreGraphView {
  const selectors = options.selectors;
  return {
    selectedGraphNodeId: options.selectedGraphNodeId,
    graph: selectors.graph,
    planLocked: selectors.planLocked,
    nodeLayoutLocked: selectors.nodeLayoutLocked,
    completedGraphNodeIds: selectors.completedGraphNodeIds,
    graphNodeNotes: selectors.graphNodeNotes,
    selectedGraphNode: selectors.selectedGraphNode,
    selectedGraphNodeState: selectors.selectedGraphNodeState,
    inspectorViewModel: selectors.inspectorViewModel,
  };
}
