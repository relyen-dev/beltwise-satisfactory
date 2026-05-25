import { z } from 'zod';

export type ItemId = string;
export type RecipeId = string;
export type MachineId = string;

export const recipeAvailabilityCategorySchema = z.enum([
  'standard',
  'unlock',
  'converter',
  'alternate'
]);

export const ingredientAmountSchema = z.object({
  itemId: z.string().min(1),
  amount: z.number().nonnegative()
});

export const itemRateSchema = z.object({
  itemId: z.string().min(1),
  amountPerMinute: z.number().positive()
});

export const itemSchema = z.object({
  id: z.string().min(1),
  className: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  form: z.enum(['solid', 'liquid', 'gas', 'invalid', 'unknown']),
  stackSize: z.string().optional(),
  energyValue: z.number().optional(),
  sinkPoints: z.number().finite().positive().optional(),
  iconRef: z.string().optional(),
  category: z.string().optional()
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  className: z.string().min(1),
  displayName: z.string().min(1),
  ingredients: z.array(ingredientAmountSchema),
  products: z.array(ingredientAmountSchema),
  durationSeconds: z.number().positive(),
  producedIn: z.array(z.string().min(1)),
  isAlternate: z.boolean(),
  availabilityCategory: recipeAvailabilityCategorySchema.optional(),
  isHandCraftOnly: z.boolean(),
  tags: z.array(z.string()),
  unlocks: z.array(z.string()).optional(),
  variablePower: z
    .object({
      constant: z.number(),
      factor: z.number()
    })
    .optional()
});

export const machineExtractionSchema = z.object({
  amountPerCycle: z.number().positive().optional(),
  cycleTimeSeconds: z.number().positive().optional(),
  amountPerMinute: z.number().positive().optional(),
  allowedResourceForms: z
    .array(z.enum(['solid', 'liquid', 'gas', 'invalid', 'unknown']))
    .optional(),
  allowedResourceItemIds: z.array(z.string().min(1)).optional(),
  extractorTypeName: z.string().optional()
});

export const machineSchema = z.object({
  id: z.string().min(1),
  className: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum([
    'manufacturer',
    'variablePowerManufacturer',
    'extractor',
    'resourceWellExtractor',
    'generator',
    'waterPump',
    'unknown'
  ]),
  powerMw: z.number().optional(),
  powerRangeMw: z
    .object({
      min: z.number(),
      max: z.number()
    })
    .optional(),
  manufacturingSpeed: z.number().positive().optional(),
  extraction: machineExtractionSchema.optional()
});

export const generatorFuelOptionSchema = z.object({
  id: z.string().min(1),
  generatorId: z.string().min(1),
  fuelItemId: z.string().min(1),
  powerMw: z.number().positive(),
  fuelConsumedPerMinute: z.number().positive(),
  supplementalInputs: z.array(itemRateSchema),
  byproducts: z.array(itemRateSchema)
});

export const resourceInfoSchema = z.object({
  itemId: z.string().min(1),
  displayName: z.string().min(1),
  extraction: z
    .object({
      allowedExtractors: z.array(z.string().min(1)),
      baselineMaxPerMinute: z.number().positive().optional(),
      notes: z.string().optional()
    })
    .optional()
});

export const schematicSchema = z.object({
  id: z.string().min(1),
  className: z.string().min(1),
  displayName: z.string().min(1),
  type: z.string().optional()
});

export const gameDatasetSchema = z.object({
  id: z.string().min(1),
  game: z.literal('satisfactory'),
  gameVersionLabel: z.string().min(1),
  generatedAt: z.string().min(1),
  source: z.object({
    docsFileName: z.string().min(1),
    docsLastModified: z.string().optional(),
    fingerprint: z.string().optional()
  }),
  items: z.record(z.string(), itemSchema),
  recipes: z.record(z.string(), recipeSchema),
  machines: z.record(z.string(), machineSchema),
  generatorFuelOptions: z.record(z.string(), generatorFuelOptionSchema),
  resources: z.record(z.string(), resourceInfoSchema),
  schematics: z.record(z.string(), schematicSchema)
});

export type IngredientAmount = z.infer<typeof ingredientAmountSchema>;
export type ItemRate = z.infer<typeof itemRateSchema>;
export type Item = z.infer<typeof itemSchema>;
export type RecipeAvailabilityCategory = z.infer<typeof recipeAvailabilityCategorySchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type MachineExtraction = z.infer<typeof machineExtractionSchema>;
export type Machine = z.infer<typeof machineSchema>;
export type GeneratorFuelOption = z.infer<typeof generatorFuelOptionSchema>;
export type ResourceInfo = z.infer<typeof resourceInfoSchema>;
export type Schematic = z.infer<typeof schematicSchema>;
export type GameDataset = z.infer<typeof gameDatasetSchema>;

export interface GeneratedDatasetOptions {
  datasetId?: string;
  gameVersionLabel?: string;
  docsFileName: string;
  docsLastModified?: string;
  sourceFingerprint?: string;
  generatedAt?: string;
}

const CONVERTER_MACHINE_ID: MachineId = 'Build_Converter_C';
const DETERMINISTIC_UNLOCK_RECIPE_ID_SET = new Set<RecipeId>([
  'Recipe_Alternate_EnrichedCoal_C',
  'Recipe_Alternate_Turbofuel_C'
]);

export function isDeterministicUnlockRecipeId(recipeId: RecipeId): boolean {
  return DETERMINISTIC_UNLOCK_RECIPE_ID_SET.has(recipeId);
}

export function recipeAvailabilityCategoryForDataset(
  dataset: Pick<GameDataset, 'resources'>,
  recipe: Recipe,
): RecipeAvailabilityCategory {
  return recipe.availabilityCategory ?? inferLegacyRecipeAvailabilityCategory(dataset, recipe);
}

function inferLegacyRecipeAvailabilityCategory(
  dataset: Pick<GameDataset, 'resources'>,
  recipe: Pick<Recipe, 'id' | 'className' | 'isAlternate' | 'producedIn' | 'products'>,
): RecipeAvailabilityCategory {
  if (
    isDeterministicUnlockRecipeId(recipe.id) ||
    isDeterministicUnlockRecipeId(recipe.className)
  ) {
    return 'unlock';
  }

  if (recipe.isAlternate) {
    return 'alternate';
  }

  if (
    recipe.producedIn.includes(CONVERTER_MACHINE_ID) &&
    recipe.products.length > 0 &&
    recipe.products.every((product) =>
      Object.prototype.hasOwnProperty.call(dataset.resources, product.itemId),
    )
  ) {
    return 'converter';
  }

  return 'standard';
}
