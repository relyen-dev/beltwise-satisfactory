import type { GameDataset, ItemId, Machine, Recipe, RecipeId } from '@beltwise/game-data';
import type {
  ItemFlow,
  ItemFlowEndpoint,
  MachineUsage,
  PlanWarning,
  ProductTarget,
  ProductionPlanResult
} from '@beltwise/planner-core';
import type { LinearSolverResult } from './SolverAdapter';
import type { ProductionLpModel, ProductionPlanInput } from './lpModel';

const EPSILON = 0.000001;
const RELATIVE_RECIPE_NOISE_FACTOR = 0.00001;

interface SolvedProductionValues {
  recipeRates: Record<RecipeId, number>;
  rawInputs: Record<ItemId, number>;
  externalInputs: Record<ItemId, number>;
  surplus: Record<ItemId, number>;
  outputs: Record<ItemId, number>;
  maximizeOutputsByTargetId: Record<string, number>;
}

interface ItemSource {
  endpoint: ItemFlowEndpoint;
  amountPerMinute: number;
}

interface ItemDemand {
  endpoint: ItemFlowEndpoint;
  amountPerMinute: number;
}

interface ItemFlowAllocationContext {
  downstreamRecipeIdsByRecipeId: Map<RecipeId, Set<RecipeId>>;
}

export function buildProductionPlanResultFromSolution(
  input: ProductionPlanInput,
  model: ProductionLpModel,
  linearResult: LinearSolverResult,
): ProductionPlanResult {
  if (linearResult.status !== 'optimal') {
    return emptyResult(linearResult.status, [
      {
        code: `solver-${linearResult.status}`,
        message: linearResult.message ?? `Production solve finished with ${linearResult.status} status.`
      }
    ]);
  }

  const solvedValues = collectSolvedValues(input, model, linearResult.variables);
  const machineUsage = buildMachineUsage(input.dataset, input.project, solvedValues.recipeRates);

  return {
    status: 'optimal',
    recipeRates: solvedValues.recipeRates,
    rawInputs: solvedValues.rawInputs,
    externalInputs: solvedValues.externalInputs,
    itemFlows: buildItemFlows(input, solvedValues),
    outputs: solvedValues.outputs,
    surplus: solvedValues.surplus,
    machineUsage,
    powerMw: cleanNumber(machineUsage.reduce((total, usage) => total + usage.powerMw, 0)),
    warnings: []
  };
}

export function buildMachineUsage(
  dataset: GameDataset,
  project: ProductionPlanInput['project'],
  recipeRates: Record<RecipeId, number>,
): MachineUsage[] {
  return Object.entries(recipeRates)
    .filter(([, recipeRatePerMinute]) => recipeRatePerMinute > EPSILON)
    .map(([recipeId, recipeRatePerMinute]) => {
      const recipe = dataset.recipes[recipeId];
      const machine = recipe ? selectRecipeMachine(dataset, project, recipe) : undefined;
      const durationSeconds = recipe?.durationSeconds ?? 60;
      const executionsPerMachinePerMinute = 60 / durationSeconds;
      const machineSpeed = machine?.manufacturingSpeed ?? 1;
      const machineCount = recipeRatePerMinute / executionsPerMachinePerMinute / machineSpeed;
      return {
        recipeId,
        machineId: machine?.id ?? 'unknown-machine',
        machineDisplayName: machine?.displayName ?? 'Unknown machine',
        recipeDisplayName: recipe?.displayName ?? recipeId,
        recipeRatePerMinute: cleanNumber(recipeRatePerMinute),
        machineCount: cleanNumber(machineCount),
        powerMw: cleanNumber(machineCount * machinePowerMw(machine))
      };
    });
}

export function cleanPositiveRecord<TId extends string>(
  record: Record<TId, number>,
  minValue = EPSILON,
): Record<TId, number> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, cleanNumber(value as number)] as const)
      .filter(([, value]) => value > minValue),
  ) as Record<TId, number>;
}

function collectSolvedValues(
  input: ProductionPlanInput,
  model: ProductionLpModel,
  variables: Record<string, number>,
): SolvedProductionValues {
  const recipeRates: Record<RecipeId, number> = {};
  for (const [recipeId, variableName] of Object.entries(model.metadata.recipeVariableById)) {
    recipeRates[recipeId] = variableValue(variables, variableName);
  }

  const rawInputs: Record<ItemId, number> = {};
  for (const [itemId, variableName] of Object.entries(model.metadata.rawInputVariableByItemId)) {
    rawInputs[itemId] = variableValue(variables, variableName);
  }

  const externalInputs: Record<ItemId, number> = {};
  for (const [itemId, variableName] of Object.entries(model.metadata.externalInputVariableByItemId)) {
    externalInputs[itemId] = variableValue(variables, variableName);
  }

  const surplus: Record<ItemId, number> = {};
  for (const [itemId, variableName] of Object.entries(model.metadata.surplusVariableByItemId)) {
    surplus[itemId] = variableValue(variables, variableName);
  }

  const maximizeOutputsByTargetId: Record<string, number> = {};
  for (const [targetId, variableName] of Object.entries(model.metadata.maximizeVariableByTargetId)) {
    maximizeOutputsByTargetId[targetId] = variableValue(variables, variableName);
  }

  return {
    recipeRates: cleanPositiveRecord(recipeRates, relativeNoiseThreshold(recipeRates)),
    rawInputs: cleanPositiveRecord(rawInputs, relativeNoiseThreshold(rawInputs)),
    externalInputs: cleanPositiveRecord(externalInputs, relativeNoiseThreshold(externalInputs)),
    surplus: cleanPositiveRecord(surplus, relativeNoiseThreshold(surplus)),
    outputs: buildOutputs(input.project.targets, maximizeOutputsByTargetId),
    maximizeOutputsByTargetId: cleanPositiveRecord(maximizeOutputsByTargetId)
  };
}

function buildOutputs(
  targets: ProductTarget[],
  maximizeOutputsByTargetId: Record<string, number>,
): Record<ItemId, number> {
  const outputs: Record<ItemId, number> = {};
  for (const target of targets) {
    const amountPerMinute =
      target.mode === 'fixed' ? (target.amountPerMinute ?? 0) : (maximizeOutputsByTargetId[target.id] ?? 0);
    if (amountPerMinute <= EPSILON) {
      continue;
    }
    outputs[target.itemId] = (outputs[target.itemId] ?? 0) + amountPerMinute;
  }
  return cleanPositiveRecord(outputs);
}

function buildItemFlows(input: ProductionPlanInput, solvedValues: SolvedProductionValues): ItemFlow[] {
  const itemIds = new Set<ItemId>();
  const allocationContext = buildItemFlowAllocationContext(input.dataset, solvedValues.recipeRates);
  for (const itemId of Object.keys(solvedValues.rawInputs)) {
    itemIds.add(itemId);
  }
  for (const itemId of Object.keys(solvedValues.externalInputs)) {
    itemIds.add(itemId);
  }
  for (const itemId of Object.keys(solvedValues.surplus)) {
    itemIds.add(itemId);
  }
  for (const target of input.project.targets) {
    itemIds.add(target.itemId);
  }

  for (const [recipeId, recipeRatePerMinute] of Object.entries(solvedValues.recipeRates)) {
    const recipe = input.dataset.recipes[recipeId];
    if (!recipe || recipeRatePerMinute <= EPSILON) {
      continue;
    }
    for (const ingredient of recipe.ingredients) {
      itemIds.add(ingredient.itemId);
    }
    for (const product of recipe.products) {
      itemIds.add(product.itemId);
    }
  }

  const flows: ItemFlow[] = [];
  for (const itemId of Array.from(itemIds).sort()) {
    const sources = buildItemSources(input.dataset, itemId, solvedValues);
    const demands = buildItemDemands(input.dataset, input.project.targets, itemId, solvedValues);
    flows.push(...matchItemFlows(itemId, sources, demands, allocationContext));
  }

  return flows.filter((flow) => flow.amountPerMinute > EPSILON);
}

function buildItemFlowAllocationContext(
  dataset: GameDataset,
  recipeRates: Record<RecipeId, number>,
): ItemFlowAllocationContext {
  const solvedRecipeIds = Object.entries(recipeRates)
    .filter(([, recipeRatePerMinute]) => recipeRatePerMinute > EPSILON)
    .map(([recipeId]) => recipeId as RecipeId);
  const solvedRecipeIdSet = new Set(solvedRecipeIds);
  const consumerRecipeIdsByItemId = new Map<ItemId, RecipeId[]>();
  const downstreamRecipeIdsByRecipeId = new Map<RecipeId, Set<RecipeId>>();

  for (const recipeId of solvedRecipeIds) {
    const recipe = dataset.recipes[recipeId];
    if (!recipe) {
      continue;
    }
    downstreamRecipeIdsByRecipeId.set(recipeId, new Set());
    for (const ingredient of recipe.ingredients) {
      const consumerRecipeIds = consumerRecipeIdsByItemId.get(ingredient.itemId) ?? [];
      consumerRecipeIds.push(recipeId);
      consumerRecipeIdsByItemId.set(ingredient.itemId, consumerRecipeIds);
    }
  }

  for (const recipeId of solvedRecipeIds) {
    const recipe = dataset.recipes[recipeId];
    if (!recipe) {
      continue;
    }
    const downstreamRecipeIds = downstreamRecipeIdsByRecipeId.get(recipeId);
    if (!downstreamRecipeIds) {
      continue;
    }
    for (const product of recipe.products) {
      for (const consumerRecipeId of consumerRecipeIdsByItemId.get(product.itemId) ?? []) {
        if (consumerRecipeId !== recipeId && solvedRecipeIdSet.has(consumerRecipeId)) {
          downstreamRecipeIds.add(consumerRecipeId);
        }
      }
    }
  }

  return { downstreamRecipeIdsByRecipeId };
}

function buildItemSources(
  dataset: GameDataset,
  itemId: ItemId,
  solvedValues: SolvedProductionValues,
): ItemSource[] {
  const sources: ItemSource[] = [];
  const rawInputAmount = solvedValues.rawInputs[itemId] ?? 0;
  if (rawInputAmount > EPSILON) {
    sources.push({
      endpoint: { kind: 'resource', id: itemId },
      amountPerMinute: rawInputAmount
    });
  }

  const externalInputAmount = solvedValues.externalInputs[itemId] ?? 0;
  if (externalInputAmount > EPSILON) {
    sources.push({
      endpoint: { kind: 'externalInput', id: itemId },
      amountPerMinute: externalInputAmount
    });
  }

  for (const [recipeId, recipeRatePerMinute] of Object.entries(solvedValues.recipeRates).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const recipe = dataset.recipes[recipeId];
    if (!recipe || recipeRatePerMinute <= EPSILON) {
      continue;
    }
    const productAmountPerMinute = sumItemAmount(recipe.products, itemId) * recipeRatePerMinute;
    if (productAmountPerMinute <= EPSILON) {
      continue;
    }
    sources.push({
      endpoint: { kind: 'recipe', id: recipeId },
      amountPerMinute: productAmountPerMinute
    });
  }

  return sources;
}

function buildItemDemands(
  dataset: GameDataset,
  targets: ProductTarget[],
  itemId: ItemId,
  solvedValues: SolvedProductionValues,
): ItemDemand[] {
  const demands: ItemDemand[] = [];

  for (const [recipeId, recipeRatePerMinute] of Object.entries(solvedValues.recipeRates).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const recipeDemand = recipeIngredientDemand(recipeId, itemId, recipeRatePerMinute);
    if (recipeDemand) {
      demands.push(recipeDemand);
    }
  }

  for (const target of targets.toSorted((left, right) => left.sortOrder - right.sortOrder)) {
    if (target.itemId !== itemId) {
      continue;
    }
    const amountPerMinute =
      target.mode === 'fixed'
        ? (target.amountPerMinute ?? 0)
        : (solvedValues.maximizeOutputsByTargetId[target.id] ?? 0);
    if (amountPerMinute <= EPSILON) {
      continue;
    }
    demands.push({
      endpoint: { kind: 'output', id: target.id },
      amountPerMinute
    });
  }

  const surplusAmount = solvedValues.surplus[itemId] ?? 0;
  if (surplusAmount > EPSILON) {
    demands.push({
      endpoint: { kind: 'byproduct', id: itemId },
      amountPerMinute: surplusAmount
    });
  }

  return demands;

  function recipeIngredientDemand(
    recipeId: RecipeId,
    demandedItemId: ItemId,
    recipeRatePerMinute: number,
  ): ItemDemand | undefined {
    if (recipeRatePerMinute <= EPSILON) {
      return undefined;
    }
    const recipe = solvedRecipe(recipeId);
    if (!recipe) {
      return undefined;
    }
    const amountPerMinute = sumItemAmount(recipe.ingredients, demandedItemId) * recipeRatePerMinute;
    if (amountPerMinute <= EPSILON) {
      return undefined;
    }
    return {
      endpoint: { kind: 'recipe', id: recipeId },
      amountPerMinute
    };
  }

  function solvedRecipe(recipeId: RecipeId): Recipe | undefined {
    return dataset.recipes[recipeId];
  }
}

function matchItemFlows(
  itemId: ItemId,
  sources: ItemSource[],
  demands: ItemDemand[],
  allocationContext: ItemFlowAllocationContext,
): ItemFlow[] {
  const remainingSources = sources.map((source) => ({ ...source }));
  const flows: ItemFlow[] = [];

  for (const demand of demands) {
    let remainingDemand = demand.amountPerMinute;
    while (remainingDemand > EPSILON) {
      const sourceIndex = chooseSourceIndex(remainingSources, demand.endpoint, allocationContext);
      if (sourceIndex === undefined) {
        break;
      }

      const source = remainingSources[sourceIndex];
      if (!source) {
        break;
      }

      const amountPerMinute = Math.min(source.amountPerMinute, remainingDemand);
      if (amountPerMinute > EPSILON) {
        flows.push({
          itemId,
          amountPerMinute: cleanNumber(amountPerMinute),
          source: source.endpoint,
          target: demand.endpoint
        });
      }

      source.amountPerMinute = cleanNumber(source.amountPerMinute - amountPerMinute);
      remainingDemand = cleanNumber(remainingDemand - amountPerMinute);
    }
  }

  return flows;
}

function chooseSourceIndex(
  sources: ItemSource[],
  targetEndpoint: ItemFlowEndpoint,
  allocationContext: ItemFlowAllocationContext,
): number | undefined {
  const upstreamNonSelfIndex = sources.findIndex(
    (source) =>
      source.amountPerMinute > EPSILON &&
      !isSameEndpoint(source.endpoint, targetEndpoint) &&
      !isDownstreamRecipeSource(source.endpoint, targetEndpoint, allocationContext),
  );
  if (upstreamNonSelfIndex >= 0) {
    return upstreamNonSelfIndex;
  }

  const nonSelfIndex = sources.findIndex(
    (source) =>
      source.amountPerMinute > EPSILON && !isSameEndpoint(source.endpoint, targetEndpoint),
  );
  if (nonSelfIndex >= 0) {
    return nonSelfIndex;
  }

  const anyIndex = sources.findIndex((source) => source.amountPerMinute > EPSILON);
  return anyIndex >= 0 ? anyIndex : undefined;
}

function isSameEndpoint(left: ItemFlowEndpoint, right: ItemFlowEndpoint): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function isDownstreamRecipeSource(
  sourceEndpoint: ItemFlowEndpoint,
  targetEndpoint: ItemFlowEndpoint,
  allocationContext: ItemFlowAllocationContext,
): boolean {
  if (sourceEndpoint.kind !== 'recipe' || targetEndpoint.kind !== 'recipe') {
    return false;
  }
  return isDownstreamRecipe(
    allocationContext.downstreamRecipeIdsByRecipeId,
    sourceEndpoint.id as RecipeId,
    targetEndpoint.id as RecipeId,
  );
}

function isDownstreamRecipe(
  downstreamRecipeIdsByRecipeId: ReadonlyMap<RecipeId, ReadonlySet<RecipeId>>,
  candidateRecipeId: RecipeId,
  upstreamRecipeId: RecipeId,
): boolean {
  const visitedRecipeIds = new Set<RecipeId>();
  const pendingRecipeIds = [...(downstreamRecipeIdsByRecipeId.get(upstreamRecipeId) ?? [])];

  while (pendingRecipeIds.length > 0) {
    const recipeId = pendingRecipeIds.pop();
    if (!recipeId || visitedRecipeIds.has(recipeId)) {
      continue;
    }
    if (recipeId === candidateRecipeId) {
      return true;
    }
    visitedRecipeIds.add(recipeId);
    pendingRecipeIds.push(...(downstreamRecipeIdsByRecipeId.get(recipeId) ?? []));
  }

  return false;
}

function selectRecipeMachine(
  dataset: GameDataset,
  project: ProductionPlanInput['project'],
  recipe: Recipe,
): Machine | undefined {
  const machineId =
    recipe.producedIn.find((candidate) => dataset.machines[candidate] && project.machineOverrides[candidate]?.enabled !== false) ??
    recipe.producedIn.find((candidate) => dataset.machines[candidate]);
  return machineId ? dataset.machines[machineId] : undefined;
}

function machinePowerMw(machine: Machine | undefined): number {
  if (!machine) {
    return 0;
  }
  if (machine.powerMw !== undefined) {
    return machine.powerMw;
  }
  if (machine.powerRangeMw) {
    return (machine.powerRangeMw.min + machine.powerRangeMw.max) / 2;
  }
  return 0;
}

function sumItemAmount(amounts: ReadonlyArray<{ itemId: ItemId; amount: number }>, itemId: ItemId): number {
  return amounts
    .filter((amount) => amount.itemId === itemId)
    .reduce((total, amount) => total + amount.amount, 0);
}

function emptyResult(status: ProductionPlanResult['status'], warnings: PlanWarning[]): ProductionPlanResult {
  return {
    status,
    recipeRates: {},
    rawInputs: {},
    externalInputs: {},
    itemFlows: [],
    outputs: {},
    surplus: {},
    machineUsage: [],
    powerMw: 0,
    warnings
  };
}

function variableValue(variables: Record<string, number>, variableName: string): number {
  return cleanNumber(variables[variableName] ?? 0);
}

function relativeNoiseThreshold(record: Record<string, number>): number {
  const largestValue = Math.max(0, ...Object.values(record).map((value) => Math.abs(value)));
  return Math.max(EPSILON, largestValue * RELATIVE_RECIPE_NOISE_FACTOR);
}

function cleanNumber(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
