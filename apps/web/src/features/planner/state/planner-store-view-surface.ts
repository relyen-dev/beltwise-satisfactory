import { type Signal, type WritableSignal } from '@angular/core';
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
