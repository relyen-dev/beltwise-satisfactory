import {
  type GameDataset,
  type Item,
  type ItemId,
  type Machine,
  type MachineId,
  type Recipe,
  type ResourceInfo,
} from '@beltwise/game-data';
import {
  buildProductionGraph,
  buildMachinePanelReport,
  defaultRawResourceOpinionMultiplier,
  type GraphNodeBuildState,
  NEUTRAL_RAW_RESOURCE_MULTIPLIER,
  type ObjectiveProfile,
  normalizePlainTextNote,
  plannerRelevantMachineIds,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ProductTarget,
  type RateDecimalPlaces,
  rawResourceMultiplierCanAffectRouteCost,
  sanitizeRawResourceMultiplier,
  solveReadyProject,
  summarizeMachineUsageByMachineId,
} from '@beltwise/planner-core';
import { formatPlannerInteger, formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { gameIconPathForItemId, gameIconPathForMachineId } from '../shared-ui/game-icon.helpers';
import {
  defaultResourceCapPerMinute,
  formatResourceCap,
  normalizeResourceOverride,
  resourceCapInputValue,
} from '../shared-ui/planner-domain.helpers';

export interface ResourceRow {
  resource: ResourceInfo;
  enabled: boolean;
  iconSrc: string;
  isCustom: boolean;
  capInputValue: number | null;
  baselineCapLabel: string;
  effectiveCapLabel: string;
}

export interface RawResourceMultiplierRow {
  resource: ResourceInfo;
  iconSrc: string;
  builtInCost: number;
  builtInCostLabel: string;
  multiplier: number;
  multiplierLabel: string;
  effectiveCost: number;
  effectiveCostLabel: string;
  isNeutral: boolean;
  stateLabel: string;
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
  toggleLabel: string;
  typeLabel: string;
  usage: MachineUsageSummary | null;
}

export interface MachineUsageSummary {
  machineCount: number;
  powerMw: number;
  recipeGroupCount: number;
  machineCountLabel: string;
  powerLabel: string;
  recipeGroupCountLabel: string;
}

export interface MachinePanelSummary {
  activeRecipeGroupCount: number;
  usedMachineTypeCount: number;
  totalMachineCountLabel: string;
  totalPowerLabel: string;
}

export interface RecipeItemIcon {
  itemId: ItemId;
  displayName: string;
  iconSrc: string;
}

export interface RecipeDetailLine {
  itemId: ItemId;
  displayName: string;
  iconSrc: string;
  amountPerMinuteLabel: string;
}

export interface RecipeDetails {
  durationLabel: string;
  ingredients: RecipeDetailLine[];
  products: RecipeDetailLine[];
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
  isConverterResourceRecipe: boolean;
  details: RecipeDetails;
  toggleLabel: string;
}

export interface ProductionGraphInput {
  dataset: GameDataset;
  result: ProductionPlanResult;
  targets: ProductTarget[];
  rateDecimalPlaces: RateDecimalPlaces;
}

type ResourceOverrideSource = Pick<PlannerProject, 'resourceOverrides'>;
type MachineOverrideSource = Pick<PlannerProject, 'machineOverrides'>;
type RecipeOverrideSource = Pick<PlannerProject, 'recipeOverrides'>;

const CONVERTER_MACHINE_ID: MachineId = 'Build_Converter_C';
const MAX_RECIPE_PRODUCT_ICONS = 1;

export function selectItemOptions(dataset: GameDataset | null): Item[] {
  return dataset
    ? Object.values(dataset.items).toSorted((left, right) =>
        left.displayName.localeCompare(right.displayName),
      )
    : [];
}

export function selectResourceRows(
  dataset: GameDataset,
  source: ResourceOverrideSource,
): ResourceRow[] {
  return Object.values(dataset.resources)
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((resource) => {
      const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
      const override = normalizeResourceOverride(
        source.resourceOverrides[resource.itemId] ?? {},
        baselineCapPerMinute,
      );
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

export function selectRawResourceMultiplierRows(
  dataset: GameDataset,
  profile: ObjectiveProfile,
): RawResourceMultiplierRow[] {
  const candidates = Object.values(dataset.resources)
    .map((resource) => {
      const builtInCost = builtInRawResourceCost(resource);
      return builtInCost > 0 && rawResourceMultiplierCanAffectRouteCost(resource.itemId)
        ? { resource, builtInCost }
        : undefined;
    })
    .filter(isDefined);
  const lowestBuiltInCost = Math.min(...candidates.map((candidate) => candidate.builtInCost));

  return candidates
    .toSorted((left, right) => left.resource.displayName.localeCompare(right.resource.displayName))
    .map(({ resource, builtInCost }) => {
      const builtInRelativeCost = builtInCost / lowestBuiltInCost;
      const multiplier = sanitizeRawResourceMultiplier(
        profile.rawResourceMultipliers[resource.itemId] ?? NEUTRAL_RAW_RESOURCE_MULTIPLIER,
      );
      const effectiveCost = builtInRelativeCost * multiplier;
      const isNeutral = multiplier === NEUTRAL_RAW_RESOURCE_MULTIPLIER;
      return {
        resource,
        iconSrc: gameIconPathForItemId(resource.itemId),
        builtInCost: builtInRelativeCost,
        builtInCostLabel: formatRouteCost(builtInRelativeCost),
        multiplier,
        multiplierLabel: `${formatPlannerNumber(multiplier)}x`,
        effectiveCost,
        effectiveCostLabel: formatRouteCost(effectiveCost),
        isNeutral,
        stateLabel: isNeutral
          ? 'Neutral'
          : multiplier > NEUTRAL_RAW_RESOURCE_MULTIPLIER
            ? 'Avoid'
            : 'Prefer',
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

export function selectMachineRows(
  dataset: GameDataset,
  source: MachineOverrideSource,
  result: ProductionPlanResult | null = null,
): MachineRow[] {
  const relevantMachineIds = plannerRelevantMachineIds(dataset);
  const usageByMachineId = selectMachineUsageByMachineId(result);
  return Array.from(relevantMachineIds)
    .map((machineId) => dataset.machines[machineId])
    .filter(isDefined)
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((machine) => {
      const enabled = source.machineOverrides[machine.id]?.enabled !== false;
      return {
        machine,
        enabled,
        iconSrc: gameIconPathForMachineId(machine.id),
        powerLabel: formatMachinePower(machine),
        toggleLabel: `${machine.displayName} machine availability`,
        typeLabel: formatMachineType(machine.type),
        usage: usageByMachineId.get(machine.id) ?? null,
      };
    });
}

export function selectMachinePanelSummary(
  result: ProductionPlanResult | null,
): MachinePanelSummary {
  const report = buildMachinePanelReport(result);

  return {
    activeRecipeGroupCount: report.activeRecipeGroupCount,
    usedMachineTypeCount: report.usedMachineTypeCount,
    totalMachineCountLabel: `${formatPlannerNumber(report.totalMachineCount)}x`,
    totalPowerLabel: `${formatPlannerNumber(report.totalPowerMw)} MW`,
  };
}

export function selectRecipeRows(
  dataset: GameDataset,
  source: RecipeOverrideSource,
  search: string,
): RecipeRow[] {
  const normalizedSearch = search.trim().toLowerCase();
  return Object.values(dataset.recipes)
    .filter((recipe) => recipe.displayName.toLowerCase().includes(normalizedSearch))
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .map((recipe) => {
      const enabled = source.recipeOverrides[recipe.id]?.enabled !== false;
      return {
        recipe,
        enabled,
        machineName: dataset.machines[recipe.producedIn[0] ?? '']?.displayName ?? 'Unknown machine',
        ...selectRecipeIconFields(dataset, recipe),
        isConverterResourceRecipe: isConverterResourceRecipe(dataset, recipe),
        details: selectRecipeDetails(dataset, recipe),
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
    Object.entries(project.buildState.nodeStates).flatMap(([nodeId, nodeState]) => {
      const note = nodeState.note === undefined ? '' : normalizePlainTextNote(nodeState.note);
      return note.length > 0 ? [[nodeId, note]] : [];
    }),
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

function builtInRawResourceCost(resource: ResourceInfo): number {
  return defaultRawResourceOpinionMultiplier(resource.itemId) * rawResourceScarcityCost(resource);
}

function rawResourceScarcityCost(resource: ResourceInfo): number {
  const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
  return baselineCapPerMinute !== undefined &&
    Number.isFinite(baselineCapPerMinute) &&
    baselineCapPerMinute > 0
    ? 1 / baselineCapPerMinute
    : 1;
}

function formatRouteCost(value: number): string {
  return formatPlannerNumber(value);
}

function selectMachineUsageByMachineId(
  result: ProductionPlanResult | null,
): ReadonlyMap<MachineId, MachineUsageSummary> {
  return new Map(
    Array.from(summarizeMachineUsageByMachineId(result).values()).map((summary) => [
      summary.machineId,
      {
        machineCount: summary.machineCount,
        powerMw: summary.powerMw,
        recipeGroupCount: summary.recipeGroupCount,
        machineCountLabel: `${formatPlannerNumber(summary.machineCount)}x`,
        powerLabel: `${formatPlannerNumber(summary.powerMw)} MW`,
        recipeGroupCountLabel: `${formatPlannerInteger(summary.recipeGroupCount)} ${
          summary.recipeGroupCount === 1 ? 'recipe' : 'recipes'
        }`,
      },
    ]),
  );
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

function selectRecipeDetails(dataset: GameDataset, recipe: Recipe): RecipeDetails {
  return {
    durationLabel: `${formatRecipeDetailValue(recipe.durationSeconds)}s cycle`,
    ingredients: recipe.ingredients.map((ingredient) =>
      recipeDetailLine(dataset, recipe, ingredient.itemId, ingredient.amount),
    ),
    products: recipe.products.map((product) =>
      recipeDetailLine(dataset, recipe, product.itemId, product.amount),
    ),
  };
}

function recipeDetailLine(
  dataset: GameDataset,
  recipe: Recipe,
  itemId: ItemId,
  amount: number,
): RecipeDetailLine {
  return {
    itemId,
    displayName: dataset.items[itemId]?.displayName ?? itemId,
    iconSrc: gameIconPathForItemId(itemId),
    amountPerMinuteLabel: `${formatRecipeDetailValue((amount * 60) / recipe.durationSeconds)}/min`,
  };
}

function formatRecipeDetailValue(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value
    .toFixed(value < 10 ? 2 : 1)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function isConverterResourceRecipe(dataset: GameDataset, recipe: Recipe): boolean {
  return (
    !recipe.isAlternate &&
    recipe.producedIn.includes(CONVERTER_MACHINE_ID) &&
    recipe.products.length > 0 &&
    recipe.products.every((product) => dataset.resources[product.itemId] !== undefined)
  );
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
