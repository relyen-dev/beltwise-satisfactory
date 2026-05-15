import {
  type GameDataset,
  type Item,
  type Machine,
  type Recipe,
  type ResourceInfo,
} from '@beltwise/game-data';
import {
  buildProductionGraph,
  type GraphNodeBuildState,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import {
  defaultResourceCapPerMinute,
  formatResourceCap,
  plannerRelevantMachineIds,
  resourceCapInputValue,
  solveReadyProject,
} from './planner-domain.helpers';

export interface ResourceRow {
  resource: ResourceInfo;
  enabled: boolean;
  isCustom: boolean;
  capInputValue: number | null;
  baselineCapLabel: string;
  effectiveCapLabel: string;
}

export interface ExternalInputRow {
  item: Item;
  amountPerMinute: number;
}

export interface MachineRow {
  machine: Machine;
  enabled: boolean;
}

export interface RecipeRow {
  recipe: Recipe;
  enabled: boolean;
  machineName: string;
}

export function selectItemOptions(dataset: GameDataset | null): Item[] {
  return dataset
    ? Object.values(dataset.items).toSorted((left, right) =>
        left.displayName.localeCompare(right.displayName),
      )
    : [];
}

export function selectResourceRows(dataset: GameDataset, project: PlannerProject): ResourceRow[] {
  return Object.values(dataset.resources)
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((resource) => {
      const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
      const override = project.resourceOverrides[resource.itemId];
      const storedCapPerMinute = override?.maxPerMinute ?? baselineCapPerMinute;
      const enabled = override?.enabled !== false;
      return {
        resource,
        enabled,
        isCustom: override !== undefined,
        capInputValue: resourceCapInputValue(storedCapPerMinute),
        baselineCapLabel: formatResourceCap(baselineCapPerMinute),
        effectiveCapLabel: enabled ? formatResourceCap(storedCapPerMinute) : '0/min',
      };
    });
}

export function selectExternalInputRows(
  dataset: GameDataset,
  project: PlannerProject,
): ExternalInputRow[] {
  return Object.entries(project.itemInputs)
    .flatMap(([itemId, input]) => {
      const item = dataset.items[itemId];
      return item ? [{ item, amountPerMinute: input.amountPerMinute }] : [];
    })
    .toSorted((left, right) => left.item.displayName.localeCompare(right.item.displayName));
}

export function selectMachineRows(dataset: GameDataset, project: PlannerProject): MachineRow[] {
  const relevantMachineIds = plannerRelevantMachineIds(dataset);
  return Array.from(relevantMachineIds)
    .map((machineId) => dataset.machines[machineId])
    .filter(isDefined)
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((machine) => ({
      machine,
      enabled: project.machineOverrides[machine.id]?.enabled !== false,
    }));
}

export function selectRecipeRows(
  dataset: GameDataset,
  project: PlannerProject,
  search: string,
): RecipeRow[] {
  const normalizedSearch = search.trim().toLowerCase();
  return Object.values(dataset.recipes)
    .filter((recipe) => recipe.displayName.toLowerCase().includes(normalizedSearch))
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((recipe) => ({
      recipe,
      enabled: project.recipeOverrides[recipe.id]?.enabled !== false,
      machineName: dataset.machines[recipe.producedIn[0] ?? '']?.displayName ?? 'Unknown machine',
    }));
}

export function selectProductionGraph(
  dataset: GameDataset | null,
  project: PlannerProject | null,
  result: ProductionPlanResult | null,
): ProductionGraph | null {
  return dataset && project && result
    ? buildProductionGraph(dataset, solveReadyProject(project, dataset).targets, result, {
        rateDecimalPlaces: project.graphDisplay.rateDecimalPlaces,
      })
    : null;
}

export function selectCompletedGraphNodeIds(project: PlannerProject | null): ReadonlySet<string> {
  if (!project) {
    return new Set<string>();
  }

  return new Set(
    Object.entries(project.buildState.nodeStates)
      .filter(([, nodeState]) => nodeState.done === true)
      .map(([nodeId]) => nodeId),
  );
}

export function selectGraphNodeNotes(
  project: PlannerProject | null,
): Readonly<Record<string, string>> {
  if (!project) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(project.buildState.nodeStates).flatMap(([nodeId, nodeState]) =>
      nodeState.note ? [[nodeId, nodeState.note]] : [],
    ),
  );
}

export function selectGraphNode(
  graph: ProductionGraph | null,
  selectedNodeId: string | null,
): ProductionGraphNode | null {
  if (!selectedNodeId || !graph) {
    return null;
  }
  return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
}

export function selectGraphNodeState(
  project: PlannerProject | null,
  selectedNodeId: string | null,
): GraphNodeBuildState {
  if (!selectedNodeId || !project) {
    return {};
  }
  return project.buildState.nodeStates[selectedNodeId] ?? {};
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}
