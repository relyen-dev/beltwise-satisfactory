import type { GameDataset, ItemId, Recipe, RecipeId } from '@beltwise/game-data';
import type { ObjectiveStageId, PlannerProject, ProductTarget } from '@beltwise/planner-core';
import { buildResourceCapsPerMinute, type BaselineResourceLimits } from '@beltwise/planner-core';
import { machineCountPerRecipeRate, machinePowerMw, selectRecipeMachine } from './machineLogic';
import { rawResourceCost } from './rawResourceCost';

export type LpObjectiveDirection = 'minimize' | 'maximize';
export type LpConstraintSense = 'eq' | 'lte' | 'gte';

export interface LpVariable {
  name: string;
  lowerBound: number;
  upperBound?: number;
}

export interface LpConstraint {
  name: string;
  coefficients: Record<string, number>;
  sense: LpConstraintSense;
  rhs: number;
}

export interface LpObjective {
  direction: LpObjectiveDirection;
  coefficients: Record<string, number>;
}

export type ProductionObjectiveStageName =
  | 'target-output'
  | 'raw-resources'
  | 'surplus'
  | 'recipe-activity'
  | 'power'
  | 'balanced';

export interface ProductionObjectiveStage {
  name: ProductionObjectiveStageName;
  objective: LpObjective;
}

export interface ProductionLpModel {
  variables: LpVariable[];
  constraints: LpConstraint[];
  objective: LpObjective;
  objectiveStages: ProductionObjectiveStage[];
  metadata: {
    recipeVariableById: Record<RecipeId, string>;
    rawInputVariableByItemId: Record<ItemId, string>;
    externalInputVariableByItemId: Record<ItemId, string>;
    surplusVariableByItemId: Record<ItemId, string>;
    maximizeVariableByTargetId: Record<string, string>;
  };
}

export interface ProductionPlanInput {
  dataset: GameDataset;
  project: PlannerProject;
  baselineLimits?: BaselineResourceLimits;
}

const SURPLUS_BASE_COST = 0.1;
const MIN_SURPLUS_COST = 0.000001;
const RECIPE_ACTIVITY_TIEBREAKER_COST = 0.000001;
const EFFECTIVELY_UNLIMITED_RESOURCE_CAP = 1_000_000_000;
const DEFAULT_OBJECTIVE_STAGE_ORDER: readonly ObjectiveStageId[] = [
  'raw-resources',
  'surplus',
  'recipe-activity',
  'power',
];

export function buildProductionLpModel(input: ProductionPlanInput): ProductionLpModel {
  const enabledRecipes = getEnabledRecipes(input.dataset, input.project);
  const itemIds = getRelevantItemIds(input.dataset, input.project, enabledRecipes);
  const resourceCaps = buildResourceCapsPerMinute(
    input.dataset,
    input.project,
    input.baselineLimits,
  );
  const fixedOutputs = aggregateFixedTargets(input.project.targets);
  const hasMaximizeTargets = input.project.targets.some((target) => target.mode === 'maximize');
  const variables: LpVariable[] = [];
  const constraints: LpConstraint[] = [];
  const targetOutputCoefficients: Record<string, number> = {};
  const rawResourceCoefficients: Record<string, number> = {};
  const surplusCoefficients: Record<string, number> = {};
  const recipeActivityCoefficients: Record<string, number> = {};
  const powerCoefficients: Record<string, number> = {};
  const objectiveCoefficientSets = [
    targetOutputCoefficients,
    rawResourceCoefficients,
    surplusCoefficients,
    recipeActivityCoefficients,
    powerCoefficients,
  ];
  const metadata: ProductionLpModel['metadata'] = {
    recipeVariableById: {},
    rawInputVariableByItemId: {},
    externalInputVariableByItemId: {},
    surplusVariableByItemId: {},
    maximizeVariableByTargetId: {},
  };

  for (const recipe of enabledRecipes) {
    const variableName = recipeVariable(recipe.id);
    metadata.recipeVariableById[recipe.id] = variableName;
    variables.push({ name: variableName, lowerBound: 0 });
    initializeObjectiveCoefficients(variableName, objectiveCoefficientSets);
    recipeActivityCoefficients[variableName] = recipeActivityUnitCost(
      input.dataset,
      input.project,
      recipe,
    );
    powerCoefficients[variableName] = recipePowerUnitCost(input.dataset, input.project, recipe);
  }

  for (const itemId of Object.keys(input.dataset.resources)) {
    const variableName = rawInputVariable(itemId);
    metadata.rawInputVariableByItemId[itemId] = variableName;
    variables.push({
      name: variableName,
      lowerBound: 0,
      ...(isFiniteResourceCap(resourceCaps[itemId]) ? { upperBound: resourceCaps[itemId] } : {}),
    });
    initializeObjectiveCoefficients(variableName, objectiveCoefficientSets);
    rawResourceCoefficients[variableName] = rawResourceCost({
      itemId,
      dataset: input.dataset,
      project: input.project,
      baselineLimits: input.baselineLimits,
    });
  }

  for (const [itemId, inputOverride] of Object.entries(input.project.itemInputs)) {
    const variableName = externalInputVariable(itemId);
    metadata.externalInputVariableByItemId[itemId] = variableName;
    variables.push({
      name: variableName,
      lowerBound: 0,
      upperBound: inputOverride.amountPerMinute,
    });
    initializeObjectiveCoefficients(variableName, objectiveCoefficientSets);
    itemIds.add(itemId);
  }

  for (const itemId of itemIds) {
    const variableName = surplusVariable(itemId);
    metadata.surplusVariableByItemId[itemId] = variableName;
    variables.push({ name: variableName, lowerBound: 0 });
    initializeObjectiveCoefficients(variableName, objectiveCoefficientSets);
    surplusCoefficients[variableName] = Math.max(
      input.project.objectiveProfile.surplusWeight * SURPLUS_BASE_COST,
      MIN_SURPLUS_COST,
    );
  }

  for (const target of input.project.targets) {
    if (target.mode !== 'maximize') {
      continue;
    }
    const variableName = maximizeVariable(target.id);
    metadata.maximizeVariableByTargetId[target.id] = variableName;
    variables.push({ name: variableName, lowerBound: 0 });
    initializeObjectiveCoefficients(variableName, objectiveCoefficientSets);
    targetOutputCoefficients[variableName] = 1;
    itemIds.add(target.itemId);
  }

  for (const itemId of itemIds) {
    const coefficients: Record<string, number> = {};

    for (const recipe of enabledRecipes) {
      const recipeVar = metadata.recipeVariableById[recipe.id];
      if (!recipeVar) {
        continue;
      }
      const producedAmount = sumAmounts(recipe.products, itemId);
      const consumedAmount = sumAmounts(recipe.ingredients, itemId);
      const coefficient = producedAmount - consumedAmount;
      if (coefficient !== 0) {
        coefficients[recipeVar] = coefficient;
      }
    }

    const rawVar = metadata.rawInputVariableByItemId[itemId];
    if (rawVar) {
      coefficients[rawVar] = 1;
    }

    const externalVar = metadata.externalInputVariableByItemId[itemId];
    if (externalVar) {
      coefficients[externalVar] = 1;
    }

    const surplusVar = metadata.surplusVariableByItemId[itemId];
    if (surplusVar) {
      coefficients[surplusVar] = -1;
    }

    for (const target of input.project.targets) {
      if (target.mode === 'maximize' && target.itemId === itemId) {
        const targetVar = metadata.maximizeVariableByTargetId[target.id];
        if (targetVar) {
          coefficients[targetVar] = -1;
        }
      }
    }

    constraints.push({
      name: `balance:${itemId}`,
      coefficients,
      sense: 'eq',
      rhs: fixedOutputs[itemId] ?? 0,
    });
  }

  const objectiveStages: ProductionObjectiveStage[] = [
    ...(hasMaximizeTargets
      ? [
          {
            name: 'target-output' as const,
            objective: {
              direction: 'maximize' as const,
              coefficients: targetOutputCoefficients,
            },
          },
        ]
      : []),
    ...buildProductionObjectiveStages(input.project, {
      'raw-resources': rawResourceCoefficients,
      surplus: surplusCoefficients,
      'recipe-activity': recipeActivityCoefficients,
      power: powerCoefficients,
    }),
  ];

  return {
    variables,
    constraints,
    objective: objectiveStages[0]?.objective ?? {
      direction: 'minimize',
      coefficients: {},
    },
    objectiveStages,
    metadata,
  };
}

export function recipeVariable(recipeId: RecipeId): string {
  return `recipeRate:${recipeId}`;
}

export function rawInputVariable(itemId: ItemId): string {
  return `rawInput:${itemId}`;
}

export function externalInputVariable(itemId: ItemId): string {
  return `externalInput:${itemId}`;
}

export function surplusVariable(itemId: ItemId): string {
  return `surplus:${itemId}`;
}

export function maximizeVariable(targetId: string): string {
  return `maximizeTarget:${targetId}`;
}

function getEnabledRecipes(dataset: GameDataset, project: PlannerProject): Recipe[] {
  return Object.values(dataset.recipes).filter((recipe) => {
    if (recipe.isHandCraftOnly) {
      return false;
    }
    if (project.recipeOverrides[recipe.id]?.enabled === false) {
      return false;
    }
    return recipe.producedIn.some(
      (machineId) => project.machineOverrides[machineId]?.enabled !== false,
    );
  });
}

function isFiniteResourceCap(cap: number | undefined): cap is number {
  return cap !== undefined && cap < EFFECTIVELY_UNLIMITED_RESOURCE_CAP;
}

function getRelevantItemIds(
  dataset: GameDataset,
  project: PlannerProject,
  enabledRecipes: Recipe[],
): Set<ItemId> {
  const itemIds = new Set<ItemId>();
  for (const target of project.targets) {
    itemIds.add(target.itemId);
  }
  for (const recipe of enabledRecipes) {
    for (const ingredient of recipe.ingredients) {
      itemIds.add(ingredient.itemId);
    }
    for (const product of recipe.products) {
      itemIds.add(product.itemId);
    }
  }
  for (const itemId of Object.keys(dataset.resources)) {
    itemIds.add(itemId);
  }
  return itemIds;
}

function aggregateFixedTargets(targets: ProductTarget[]): Record<ItemId, number> {
  const outputs: Record<ItemId, number> = {};
  for (const target of targets) {
    if (target.mode !== 'fixed') {
      continue;
    }
    outputs[target.itemId] = (outputs[target.itemId] ?? 0) + (target.amountPerMinute ?? 0);
  }
  return outputs;
}

function sumAmounts(
  amounts: ReadonlyArray<{ itemId: ItemId; amount: number }>,
  itemId: ItemId,
): number {
  return amounts
    .filter((amount) => amount.itemId === itemId)
    .reduce((total, amount) => total + amount.amount, 0);
}

function initializeObjectiveCoefficients(
  variableName: string,
  objectiveCoefficientSets: ReadonlyArray<Record<string, number>>,
): void {
  for (const coefficients of objectiveCoefficientSets) {
    coefficients[variableName] = 0;
  }
}

function buildProductionObjectiveStages(
  project: PlannerProject,
  coefficientSets: Readonly<Record<ObjectiveStageId, Record<string, number>>>,
): ProductionObjectiveStage[] {
  const stageOrder = normalizeObjectiveStageOrder(project.objectiveProfile.stageOrder);
  const stages = stageOrder.map((stageId) => objectiveStage(stageId, coefficientSets[stageId]));

  if (project.objectiveProfile.strategy !== 'weighted') {
    return stages;
  }

  return [
    {
      name: 'balanced',
      objective: {
        direction: 'minimize',
        coefficients: combineObjectiveCoefficients(Object.values(coefficientSets)),
      },
    },
    ...stages,
  ];
}

function normalizeObjectiveStageOrder(stageOrder: readonly ObjectiveStageId[]): ObjectiveStageId[] {
  const normalized: ObjectiveStageId[] = [];
  for (const stageId of [...stageOrder, ...DEFAULT_OBJECTIVE_STAGE_ORDER]) {
    if (!normalized.includes(stageId)) {
      normalized.push(stageId);
    }
  }
  return normalized;
}

function objectiveStage(
  stageId: ObjectiveStageId,
  coefficients: Record<string, number>,
): ProductionObjectiveStage {
  return {
    name: stageId,
    objective: {
      direction: 'minimize',
      coefficients,
    },
  };
}

function combineObjectiveCoefficients(
  coefficientSets: ReadonlyArray<Record<string, number>>,
): Record<string, number> {
  const combined: Record<string, number> = {};
  for (const coefficients of coefficientSets) {
    for (const [variableName, coefficient] of Object.entries(coefficients)) {
      combined[variableName] = (combined[variableName] ?? 0) + coefficient;
    }
  }
  return combined;
}

function recipeActivityUnitCost(
  dataset: GameDataset,
  project: PlannerProject,
  recipe: Recipe,
): number {
  const machine = selectRecipeMachine(dataset, project, recipe);
  const machineCountCost =
    Math.max(0, project.objectiveProfile.machineCountWeight) *
    machineCountPerRecipeRate(recipe, machine);
  return machineCountCost + RECIPE_ACTIVITY_TIEBREAKER_COST;
}

function recipePowerUnitCost(
  dataset: GameDataset,
  project: PlannerProject,
  recipe: Recipe,
): number {
  const machine = selectRecipeMachine(dataset, project, recipe);
  return (
    Math.max(0, project.objectiveProfile.powerWeight) *
    machineCountPerRecipeRate(recipe, machine) *
    machinePowerMw(machine)
  );
}
