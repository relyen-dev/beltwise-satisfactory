import {
  type GameDataset,
  type Item,
  type ItemId,
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
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { gameIconPathForItemId, gameIconPathForMachineId } from './game-icon.helpers';
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
  iconSrc: string;
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
  iconSrc: string;
  powerLabel: string | null;
  stateLabel: string;
  toggleLabel: string;
  typeLabel: string;
}

export interface RecipeItemIcon {
  itemId: ItemId;
  displayName: string;
  iconSrc: string;
}

export interface MachineUsageRow {
  usage: ProductionPlanResult['machineUsage'][number];
  machineIconSrc: string;
}

export interface RecipeRow {
  recipe: Recipe;
  enabled: boolean;
  machineName: string;
  productIcons: RecipeItemIcon[];
  hiddenProductIconCount: number;
  stateLabel: string;
  toggleLabel: string;
}

export interface ProductionGraphInput {
  dataset: GameDataset;
  result: ProductionPlanResult;
  targets: ProductTarget[];
  rateDecimalPlaces: RateDecimalPlaces;
}

const MAX_RECIPE_PRODUCT_ICONS = 2;

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
        iconSrc: gameIconPathForItemId(resource.itemId),
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
    .map((machine) => {
      const enabled = project.machineOverrides[machine.id]?.enabled !== false;
      return {
        machine,
        enabled,
        iconSrc: gameIconPathForMachineId(machine.id),
        powerLabel: formatMachinePower(machine),
        stateLabel: availabilityStateLabel(enabled),
        toggleLabel: `${machine.displayName} machine availability`,
        typeLabel: formatMachineType(machine.type),
      };
    });
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
    .map((recipe) => {
      const enabled = project.recipeOverrides[recipe.id]?.enabled !== false;
      return {
        recipe,
        enabled,
        machineName: dataset.machines[recipe.producedIn[0] ?? '']?.displayName ?? 'Unknown machine',
        ...selectRecipeIconFields(dataset, recipe),
        stateLabel: availabilityStateLabel(enabled),
        toggleLabel: `${recipe.displayName} recipe availability`,
      };
    });
}

export function selectMachineUsageRows(result: ProductionPlanResult | null): MachineUsageRow[] {
  return result
    ? result.machineUsage.map((usage) => ({
        usage,
        machineIconSrc: gameIconPathForMachineId(usage.machineId),
      }))
    : [];
}

export function selectProductionGraph(
  dataset: GameDataset | null,
  project: PlannerProject | null,
  result: ProductionPlanResult | null,
): ProductionGraph | null {
  const input = selectProductionGraphInput(dataset, project, result);
  return input ? buildProductionGraphFromInput(input) : null;
}

export function selectProductionGraphInput(
  dataset: GameDataset | null,
  project: PlannerProject | null,
  result: ProductionPlanResult | null,
): ProductionGraphInput | null {
  return dataset && project && result
    ? {
        dataset,
        result,
        targets: solveReadyProject(project, dataset).targets,
        rateDecimalPlaces: project.graphDisplay.rateDecimalPlaces,
      }
    : null;
}

export function buildProductionGraphFromInput(input: ProductionGraphInput): ProductionGraph {
  return buildProductionGraph(input.dataset, input.targets, input.result, {
    rateDecimalPlaces: input.rateDecimalPlaces,
  });
}

export function equalProductionGraphInputs(
  left: ProductionGraphInput | null,
  right: ProductionGraphInput | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.dataset === right.dataset &&
    left.result === right.result &&
    left.rateDecimalPlaces === right.rateDecimalPlaces &&
    equalProductionGraphTargets(left.targets, right.targets)
  );
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

function availabilityStateLabel(enabled: boolean): string {
  return enabled ? 'Enabled' : 'Off';
}

function formatMachineType(type: Machine['type']): string {
  switch (type) {
    case 'manufacturer':
      return 'Manufacturer';
    case 'variablePowerManufacturer':
      return 'Variable power';
    case 'extractor':
      return 'Extractor';
    case 'resourceWellExtractor':
      return 'Resource well';
    case 'generator':
      return 'Generator';
    case 'waterPump':
      return 'Water pump';
    case 'unknown':
      return 'Unknown type';
  }
}

function formatMachinePower(machine: Machine): string | null {
  if (machine.powerRangeMw) {
    return `${formatPowerValue(machine.powerRangeMw.min)}-${formatPowerValue(
      machine.powerRangeMw.max,
    )} MW`;
  }
  return machine.powerMw === undefined ? null : `${formatPowerValue(machine.powerMw)} MW`;
}

function formatPowerValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
}

function selectRecipeIconFields(
  dataset: GameDataset,
  recipe: Recipe,
): Pick<RecipeRow, 'productIcons' | 'hiddenProductIconCount'> {
  const productItems = recipe.products.map((product) => recipeItemIcon(dataset, product.itemId));
  return {
    productIcons: productItems.slice(0, MAX_RECIPE_PRODUCT_ICONS),
    hiddenProductIconCount: Math.max(0, productItems.length - MAX_RECIPE_PRODUCT_ICONS),
  };
}

function recipeItemIcon(dataset: GameDataset, itemId: ItemId): RecipeItemIcon {
  return {
    itemId,
    displayName: dataset.items[itemId]?.displayName ?? itemId,
    iconSrc: gameIconPathForItemId(itemId),
  };
}

function equalProductionGraphTargets(left: ProductTarget[], right: ProductTarget[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((target, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      target.id === other.id &&
      target.itemId === other.itemId &&
      target.mode === other.mode &&
      target.amountPerMinute === other.amountPerMinute &&
      target.sortOrder === other.sortOrder
    );
  });
}
