import {
  type GameDataset,
  type GeneratedDatasetOptions,
  type GeneratorFuelOption,
  type IngredientAmount,
  type Item,
  type ItemId,
  type ItemRate,
  type Machine,
  type MachineExtraction,
  type MachineId,
  type Recipe,
  type RecipeAvailabilityCategory,
  type ResourceInfo,
  type Schematic,
  gameDatasetSchema,
  isDeterministicUnlockRecipeId
} from './schema';
import { fingerprintText, sortRecord } from './stableJson';
import {
  extractClassNameFromReference,
  parseUnrealTupleString,
  tupleValueAsRecords,
  tupleValueAsStrings,
  type UnrealTupleValue
} from './tupleParser';

type RawRecord = Record<string, unknown>;

interface RawDocsGroup {
  readonly NativeClass?: string;
  readonly Classes?: RawRecord[];
}

const AUTOMATED_MACHINE_MARKERS = [
  'Build_Constructor',
  'Build_Smelter',
  'Build_Foundry',
  'Build_Assembler',
  'Build_Manufacturer',
  'Build_OilRefinery',
  'Build_Refinery',
  'Build_Packager',
  'Build_Blender',
  'Build_HadronCollider',
  'Build_Converter',
  'Build_QuantumEncoder'
];

const PRODUCED_IN_MACHINE_ID_ALIASES: Readonly<Record<MachineId, MachineId>> = {
  Build_Refinery_C: 'Build_OilRefinery_C'
};

const CONVERTER_MACHINE_ID: MachineId = 'Build_Converter_C';

const ITEM_NATIVE_CLASS_MARKERS = [
  'Descriptor',
  'FGAmmoType'
];

const BASELINE_RESOURCE_LIMITS_PER_MINUTE: Record<ItemId, number> = {
  Desc_Coal_C: 42300,
  Desc_LiquidOil_C: 12600,
  Desc_NitrogenGas_C: 12000,
  Desc_OreBauxite_C: 12300,
  Desc_OreCopper_C: 36900,
  Desc_OreGold_C: 15000,
  Desc_OreIron_C: 92100,
  Desc_OreUranium_C: 2100,
  Desc_RawQuartz_C: 13500,
  Desc_SAM_C: 10200,
  Desc_Stone_C: 69300,
  Desc_Sulfur_C: 10800,
  Desc_Water_C: Number.MAX_SAFE_INTEGER
};

export function parseRawDocsJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function normalizeDocs(rawDocs: unknown, rawText: string, options: GeneratedDatasetOptions): GameDataset {
  const groups = getGroups(rawDocs);
  const itemGroups = ITEM_NATIVE_CLASS_MARKERS.flatMap((nativeClassName) => findGroups(groups, nativeClassName));
  const resourceGroups = findGroups(groups, 'FGResourceDescriptor');
  const recipeGroups = findGroups(groups, 'FGRecipe');
  const machineGroups = [
    ...findGroups(groups, 'FGBuildableManufacturer'),
    ...findGroups(groups, 'FGBuildableManufacturerVariablePower'),
    ...findGroups(groups, 'FGBuildableResourceExtractor'),
    ...findGroups(groups, 'FGBuildableFrackingExtractor'),
    ...findGroups(groups, 'FGBuildableGeneratorFuel'),
    ...findGroups(groups, 'FGBuildableGeneratorNuclear'),
    ...findGroups(groups, 'FGBuildableGeneratorGeoThermal'),
    ...findGroups(groups, 'FGBuildableWaterPump')
  ];

  const allItems = sortRecord(
    Object.fromEntries(
      itemGroups.flatMap((group) =>
        getClasses(group).map((rawClass) => {
          const item = normalizeItem(rawClass);
          return [item.id, item] as const;
        }),
      ),
    ),
  );

  const rawResourceItems = sortRecord(
    Object.fromEntries(
      resourceGroups.flatMap((group) =>
        getClasses(group).map((rawClass) => {
          const resourceItem = normalizeItem(rawClass);
          return [resourceItem.id, resourceItem] as const;
        }),
      ),
    ),
  );
  const seasonalItemIds = itemIdsFromRecords(
    itemGroups.flatMap((group) => getClasses(group).filter(isSeasonalEventRecord)),
  );
  const rawResourceItemIds = new Set(Object.keys(rawResourceItems));

  const machines = sortRecord(
    Object.fromEntries(
      machineGroups.flatMap((group) =>
        getClasses(group).map((rawClass) => {
          const machine = normalizeMachine(rawClass, group.NativeClass ?? '');
          return [machine.id, machine] as const;
        }),
      ),
    ),
  );

  const generatorFuelOptions = sortRecord(
    Object.fromEntries(
      machineGroups.flatMap((group) =>
        getClasses(group).flatMap((rawClass) =>
          normalizeGeneratorFuelOptions(rawClass, allItems).map((option) => [option.id, option] as const),
        ),
      ),
    ),
  );

  const recipes = sortRecord(
    Object.fromEntries(
      recipeGroups.flatMap((group) =>
        getClasses(group)
          .filter((rawClass) => !isSeasonalEventRecord(rawClass))
          .map((rawClass) => normalizeRecipe(rawClass, machines, allItems, rawResourceItemIds))
          .filter((recipe) => !isResourceExtractionRecipe(recipe, machines))
          .filter((recipe) => !recipe.isHandCraftOnly)
          .filter((recipe) => recipeReferencesKnownItems(recipe, allItems))
          .filter((recipe) => !recipeReferencesItemIds(recipe, seasonalItemIds))
          .map((recipe) => [recipe.id, recipe] as const),
      ),
    ),
  );

  const itemIdsUsedByProduction = itemIdsForProduction(
    Object.values(recipes),
    Object.keys(rawResourceItems),
    itemIdsForGeneratorFuelOptions(Object.values(generatorFuelOptions)),
  );
  const items = sortRecord(
    Object.fromEntries(
      [...itemIdsUsedByProduction].flatMap((itemId) => {
        const item = allItems[itemId];
        return item ? [[itemId, item] as const] : [];
      }),
    ),
  );

  const resources = sortRecord(
    Object.fromEntries(
      resourceGroups.flatMap((group) =>
        getClasses(group).map((rawClass) => {
          const resourceItem = normalizeItem(rawClass);
          const allowedExtractors = allowedExtractorsForResource(resourceItem, machines);
          const baselineMaxPerMinute = BASELINE_RESOURCE_LIMITS_PER_MINUTE[resourceItem.id];
          const resource: ResourceInfo = {
            itemId: resourceItem.id,
            displayName: resourceItem.displayName,
            ...(allowedExtractors.length > 0 || baselineMaxPerMinute !== undefined
              ? {
                  extraction: {
                    allowedExtractors,
                    ...(baselineMaxPerMinute !== undefined ? { baselineMaxPerMinute } : {})
                  }
                }
              : {})
          };
          return [resource.itemId, resource] as const;
        }),
      ),
    ),
  );

  const schematics = sortRecord(
    Object.fromEntries(
      findGroups(groups, 'FGSchematic').flatMap((group) =>
        getClasses(group)
          .filter((rawClass) => !isSeasonalEventRecord(rawClass))
          .map((rawClass) => {
            const schematic = normalizeSchematic(rawClass);
            return [schematic.id, schematic] as const;
          }),
      ),
    ),
  );

  return gameDatasetSchema.parse({
    id: options.datasetId ?? 'satisfactory-current',
    game: 'satisfactory',
    gameVersionLabel: options.gameVersionLabel ?? 'unknown',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: {
      docsFileName: options.docsFileName,
      ...(options.docsLastModified ? { docsLastModified: options.docsLastModified } : {}),
      fingerprint: options.sourceFingerprint ?? fingerprintText(rawText)
    },
    items,
    recipes,
    machines,
    generatorFuelOptions,
    resources,
    schematics
  });
}

function getGroups(rawDocs: unknown): RawDocsGroup[] {
  if (Array.isArray(rawDocs)) {
    return rawDocs.filter(isRawDocsGroup);
  }

  if (isRawRecord(rawDocs)) {
    return Object.values(rawDocs).filter(isRawDocsGroup);
  }

  return [];
}

function findGroups(groups: RawDocsGroup[], nativeClassName: string): RawDocsGroup[] {
  return groups.filter((group) => (group.NativeClass ?? '').includes(nativeClassName));
}

function getClasses(group: RawDocsGroup): RawRecord[] {
  return Array.isArray(group.Classes) ? group.Classes.filter(isRawRecord) : [];
}

function normalizeItem(rawClass: RawRecord): Item {
  const className = requiredString(rawClass, 'ClassName');
  const energyValue = numberField(rawClass, 'mEnergyValue');
  const sinkPoints = positiveNumberField(rawClass, 'mResourceSinkPoints');
  return {
    id: className,
    className,
    displayName: stringField(rawClass, 'mDisplayName') ?? className,
    form: normalizeForm(stringField(rawClass, 'mForm')),
    ...(stringField(rawClass, 'mStackSize') ? { stackSize: stringField(rawClass, 'mStackSize') } : {}),
    ...(energyValue !== undefined && energyValue > 0 ? { energyValue } : {}),
    ...(sinkPoints !== undefined ? { sinkPoints } : {})
  };
}

function normalizeRecipe(
  rawClass: RawRecord,
  machines: Record<MachineId, Machine>,
  items: Record<ItemId, Item>,
  resourceItemIds: ReadonlySet<ItemId>,
): Recipe {
  const className = requiredString(rawClass, 'ClassName');
  const producedIn = uniqueInOrder(
    parseReferenceList(stringField(rawClass, 'mProducedIn'))
      .map((machineId) => PRODUCED_IN_MACHINE_ID_ALIASES[machineId] ?? machineId)
      .filter((machineId) => Boolean(machines[machineId])),
  );
  const displayName = stringField(rawClass, 'mDisplayName') ?? className;
  const durationSeconds =
    numberField(rawClass, 'mManufactoringDuration') ?? numberField(rawClass, 'mManufacturingDuration') ?? 1;
  const ingredients = parseIngredientAmounts(stringField(rawClass, 'mIngredients'), items);
  const products = parseIngredientAmounts(stringField(rawClass, 'mProduct'), items);
  const tags = parseTagList(stringField(rawClass, 'mGameplayTags'));
  const variableConstant = numberField(rawClass, 'mVariablePowerConsumptionConstant');
  const variableFactor = numberField(rawClass, 'mVariablePowerConsumptionFactor');
  const isAlternate = isAlternateRecipe(className, displayName);
  const hasVariablePower =
    variableConstant !== undefined &&
    variableFactor !== undefined &&
    (variableConstant !== 0 || variableFactor !== 1);

  return {
    id: className,
    className,
    displayName,
    ingredients,
    products,
    durationSeconds,
    producedIn,
    isAlternate,
    availabilityCategory: recipeAvailabilityCategory({
      className,
      isAlternate,
      producedIn,
      products,
      resourceItemIds
    }),
    isHandCraftOnly: producedIn.length === 0 || !producedIn.some(isAutomatedMachineId),
    tags,
    ...(hasVariablePower
      ? { variablePower: { constant: variableConstant, factor: variableFactor } }
      : {})
  };
}

function normalizeMachine(rawClass: RawRecord, nativeClassName: string): Machine {
  const className = requiredString(rawClass, 'ClassName');
  const type = machineTypeForNativeClass(nativeClassName);
  const powerMw = numberField(rawClass, 'mPowerConsumption');
  const powerRangeMw = normalizePowerRange(rawClass);
  const manufacturingSpeed = numberField(rawClass, 'mManufacturingSpeed');
  const extraction = normalizeMachineExtraction(rawClass);
  return {
    id: className,
    className,
    displayName: stringField(rawClass, 'mDisplayName') ?? className,
    type,
    ...(powerMw !== undefined ? { powerMw } : {}),
    ...(powerRangeMw ? { powerRangeMw } : {}),
    ...(manufacturingSpeed !== undefined ? { manufacturingSpeed } : {}),
    ...(extraction ? { extraction } : {})
  };
}

function normalizeGeneratorFuelOptions(
  rawClass: RawRecord,
  items: Record<ItemId, Item>,
): GeneratorFuelOption[] {
  const generatorId = requiredString(rawClass, 'ClassName');
  const powerMw = positiveNumberField(rawClass, 'mPowerProduction');
  if (powerMw === undefined) {
    return [];
  }

  const supplementalToPowerRatio = positiveNumberField(rawClass, 'mSupplementalToPowerRatio');
  return parseGeneratorFuelEntries(rawClass['mFuel']).flatMap((entry) => {
    const fuelItemId = classNameField(entry, 'mFuelClass');
    const fuelItem = fuelItemId ? items[fuelItemId] : undefined;
    const fuelEnergyValue = fuelItem ? generatorFuelEnergyValue(fuelItem) : undefined;
    if (!fuelItemId || fuelEnergyValue === undefined) {
      return [];
    }

    const fuelConsumedPerMinute = (powerMw * 60) / fuelEnergyValue;
    return [
      {
        id: generatorFuelOptionId(generatorId, fuelItemId),
        generatorId,
        fuelItemId,
        powerMw,
        fuelConsumedPerMinute,
        supplementalInputs: normalizeGeneratorSupplementalInputs(
          entry,
          items,
          powerMw,
          supplementalToPowerRatio,
        ),
        byproducts: normalizeGeneratorByproducts(entry, items, fuelConsumedPerMinute)
      }
    ];
  });
}

function generatorFuelEnergyValue(item: Item): number | undefined {
  const energyValue = item.energyValue;
  if (energyValue === undefined || energyValue <= 0) {
    return undefined;
  }
  return item.form === 'liquid' || item.form === 'gas' ? energyValue * 1000 : energyValue;
}

function parseGeneratorFuelEntries(rawValue: unknown): RawRecord[] {
  if (Array.isArray(rawValue)) {
    return rawValue.filter(isRawRecord);
  }

  if (typeof rawValue === 'string') {
    return tupleValueAsRecords(parseTupleField(rawValue)).filter(isRawRecord);
  }

  return [];
}

function normalizeGeneratorSupplementalInputs(
  fuelEntry: RawRecord,
  items: Record<ItemId, Item>,
  powerMw: number,
  supplementalToPowerRatio: number | undefined,
): ItemRate[] {
  const supplementalItemId = classNameField(fuelEntry, 'mSupplementalResourceClass');
  const supplementalItem = supplementalItemId ? items[supplementalItemId] : undefined;
  if (!supplementalItemId || !supplementalItem || supplementalToPowerRatio === undefined) {
    return [];
  }

  return [
    {
      itemId: supplementalItemId,
      amountPerMinute: normalizeRecipeAmount(powerMw * 60 * supplementalToPowerRatio, supplementalItem)
    }
  ];
}

function normalizeGeneratorByproducts(
  fuelEntry: RawRecord,
  items: Record<ItemId, Item>,
  fuelConsumedPerMinute: number,
): ItemRate[] {
  const byproductItemId = classNameField(fuelEntry, 'mByproduct');
  const byproductItem = byproductItemId ? items[byproductItemId] : undefined;
  const byproductAmount = positiveNumberField(fuelEntry, 'mByproductAmount');
  if (!byproductItemId || !byproductItem || byproductAmount === undefined) {
    return [];
  }

  return [
    {
      itemId: byproductItemId,
      amountPerMinute: normalizeRecipeAmount(byproductAmount * fuelConsumedPerMinute, byproductItem)
    }
  ];
}

function normalizeSchematic(rawClass: RawRecord): Schematic {
  const className = requiredString(rawClass, 'ClassName');
  return {
    id: className,
    className,
    displayName: stringField(rawClass, 'mDisplayName') ?? className,
    ...(stringField(rawClass, 'mType') ? { type: stringField(rawClass, 'mType') } : {})
  };
}

function parseIngredientAmounts(
  rawValue: string | undefined,
  items: Record<ItemId, Item>,
): IngredientAmount[] {
  const parsed = parseTupleField(rawValue);
  return tupleValueAsRecords(parsed).flatMap((record) => {
    const itemClass = record['ItemClass'];
    const amount = numericTupleValue(record['Amount']);
    if (typeof itemClass !== 'string' || amount === undefined) {
      return [];
    }
    const itemId = extractClassNameFromReference(itemClass);
    return [{ itemId, amount: normalizeRecipeAmount(amount, items[itemId]) }];
  });
}

function parseReferenceList(rawValue: string | undefined): string[] {
  const parsed = parseTupleField(rawValue);
  return tupleValueAsStrings(parsed).map(extractClassNameFromReference);
}

function parseTagList(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }
  const parsed = parseTupleField(rawValue);
  return uniqueSorted(collectTagNames(parsed));
}

function parseTupleField(rawValue: string | undefined): UnrealTupleValue {
  if (!rawValue || rawValue.trim().length === 0 || rawValue.trim() === '()') {
    return [];
  }
  return parseUnrealTupleString(rawValue);
}

function machineTypeForNativeClass(nativeClassName: string): Machine['type'] {
  if (nativeClassName.includes('FGBuildableManufacturerVariablePower')) {
    return 'variablePowerManufacturer';
  }
  if (nativeClassName.includes('FGBuildableFrackingExtractor')) {
    return 'resourceWellExtractor';
  }
  if (nativeClassName.includes('FGBuildableResourceExtractor')) {
    return 'extractor';
  }
  if (nativeClassName.includes('FGBuildableGenerator')) {
    return 'generator';
  }
  if (nativeClassName.includes('FGBuildableWaterPump')) {
    return 'waterPump';
  }
  if (nativeClassName.includes('FGBuildableManufacturer')) {
    return 'manufacturer';
  }
  return 'unknown';
}

function normalizeForm(rawForm: string | undefined): Item['form'] {
  switch (rawForm) {
    case 'RF_SOLID':
      return 'solid';
    case 'RF_LIQUID':
      return 'liquid';
    case 'RF_GAS':
      return 'gas';
    case 'RF_INVALID':
    case 'INVALID':
      return 'invalid';
    default:
      return 'unknown';
  }
}

function normalizeRecipeAmount(amount: number, item: Item | undefined): number {
  return item?.form === 'liquid' || item?.form === 'gas' ? amount / 1000 : amount;
}

function isAlternateRecipe(className: string, displayName: string): boolean {
  return className.includes('Alternate') || displayName.toLowerCase().startsWith('alternate:');
}

function recipeAvailabilityCategory(input: {
  readonly className: string;
  readonly isAlternate: boolean;
  readonly producedIn: readonly MachineId[];
  readonly products: readonly IngredientAmount[];
  readonly resourceItemIds: ReadonlySet<ItemId>;
}): RecipeAvailabilityCategory {
  if (isDeterministicUnlockRecipeId(input.className)) {
    return 'unlock';
  }
  if (input.isAlternate) {
    return 'alternate';
  }
  if (
    input.producedIn.includes(CONVERTER_MACHINE_ID) &&
    input.products.length > 0 &&
    input.products.every((product) => input.resourceItemIds.has(product.itemId))
  ) {
    return 'converter';
  }
  return 'standard';
}

function isAutomatedMachineId(machineId: string): boolean {
  return AUTOMATED_MACHINE_MARKERS.some((marker) => machineId.includes(marker));
}

function numericTupleValue(value: UnrealTupleValue | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function itemIdsForProduction(
  recipes: Recipe[],
  resourceItemIds: string[],
  additionalItemIds: Iterable<ItemId> = [],
): Set<ItemId> {
  const itemIds = new Set<ItemId>(resourceItemIds);
  for (const itemId of additionalItemIds) {
    itemIds.add(itemId);
  }
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      itemIds.add(ingredient.itemId);
    }
    for (const product of recipe.products) {
      itemIds.add(product.itemId);
    }
  }
  return itemIds;
}

function itemIdsForGeneratorFuelOptions(options: GeneratorFuelOption[]): Set<ItemId> {
  const itemIds = new Set<ItemId>();
  for (const option of options) {
    itemIds.add(option.fuelItemId);
    for (const input of option.supplementalInputs) {
      itemIds.add(input.itemId);
    }
    for (const byproduct of option.byproducts) {
      itemIds.add(byproduct.itemId);
    }
  }
  return itemIds;
}

function itemIdsFromRecords(rawClasses: RawRecord[]): Set<ItemId> {
  return new Set(
    rawClasses.flatMap((rawClass) => {
      const className = stringField(rawClass, 'ClassName');
      return className ? [className] : [];
    }),
  );
}

function recipeReferencesKnownItems(recipe: Recipe, items: Record<ItemId, Item>): boolean {
  return [...recipe.ingredients, ...recipe.products].every((amount) => Boolean(items[amount.itemId]));
}

function recipeReferencesItemIds(recipe: Recipe, itemIds: ReadonlySet<ItemId>): boolean {
  return [...recipe.ingredients, ...recipe.products].some((amount) => itemIds.has(amount.itemId));
}

function isResourceExtractionRecipe(recipe: Recipe, machines: Record<MachineId, Machine>): boolean {
  return recipe.producedIn.length > 0 && recipe.producedIn.every((machineId) => {
    const machine = machines[machineId];
    return machine ? isExtractorMachine(machine) : false;
  });
}

function isSeasonalEventRecord(record: RawRecord): boolean {
  return ['ClassName', 'FullName', 'mDisplayName'].some((key) => {
    const value = stringField(record, key)?.toLowerCase() ?? '';
    return (
      value.includes('ficsmas') ||
      value.includes('xmas') ||
      value.includes('christmas') ||
      value.includes('/events/christmas/')
    );
  });
}

function allowedExtractorsForResource(resourceItem: Item, machines: Record<MachineId, Machine>): MachineId[] {
  return Object.values(machines)
    .filter(isExtractorMachine)
    .filter((machine) => machineCanExtractResource(machine, resourceItem))
    .map((machine) => machine.id)
    .toSorted((left, right) => left.localeCompare(right));
}

function isExtractorMachine(machine: Machine): boolean {
  return ['extractor', 'resourceWellExtractor', 'waterPump'].includes(machine.type);
}

function machineCanExtractResource(machine: Machine, resourceItem: Item): boolean {
  const extraction = machine.extraction;
  if (!extraction) {
    return false;
  }

  const allowedResourceItemIds = extraction.allowedResourceItemIds ?? [];
  if (allowedResourceItemIds.length > 0) {
    return allowedResourceItemIds.includes(resourceItem.id);
  }

  const allowedResourceForms = extraction.allowedResourceForms ?? [];
  return allowedResourceForms.length > 0 && allowedResourceForms.includes(resourceItem.form);
}

function normalizeMachineExtraction(rawClass: RawRecord): MachineExtraction | undefined {
  const amountPerCycle = positiveNumberField(rawClass, 'mItemsPerCycle');
  const cycleTimeSeconds = positiveNumberField(rawClass, 'mExtractCycleTime');
  const allowedResourceForms = parseResourceForms(stringField(rawClass, 'mAllowedResourceForms'));
  const allowedResourceItemIds = uniqueSorted(parseReferenceList(stringField(rawClass, 'mAllowedResources')));
  const extractorTypeName = stringField(rawClass, 'mExtractorTypeName');

  if (
    amountPerCycle === undefined &&
    cycleTimeSeconds === undefined &&
    allowedResourceForms.length === 0 &&
    allowedResourceItemIds.length === 0 &&
    !extractorTypeName
  ) {
    return undefined;
  }

  const amountPerMinute =
    amountPerCycle !== undefined && cycleTimeSeconds !== undefined
      ? (amountPerCycle * 60) / cycleTimeSeconds
      : undefined;

  return {
    ...(amountPerCycle !== undefined ? { amountPerCycle } : {}),
    ...(cycleTimeSeconds !== undefined ? { cycleTimeSeconds } : {}),
    ...(amountPerMinute !== undefined ? { amountPerMinute } : {}),
    ...(allowedResourceForms.length > 0 ? { allowedResourceForms } : {}),
    ...(allowedResourceItemIds.length > 0 ? { allowedResourceItemIds } : {}),
    ...(extractorTypeName && extractorTypeName !== 'None' ? { extractorTypeName } : {})
  };
}

function normalizePowerRange(rawClass: RawRecord): Machine['powerRangeMw'] | undefined {
  const min =
    numberField(rawClass, 'mEstimatedMinimumPowerConsumption') ??
    numberField(rawClass, 'mEstimatedMininumPowerConsumption');
  const max = numberField(rawClass, 'mEstimatedMaximumPowerConsumption');
  return min !== undefined && max !== undefined ? { min, max } : undefined;
}

function parseResourceForms(rawValue: string | undefined): Item['form'][] {
  const parsed = parseTupleField(rawValue);
  const forms = tupleValueAsStrings(parsed)
    .map(normalizeForm)
    .filter((form) => form !== 'invalid' && form !== 'unknown');
  return uniqueSorted(forms);
}

function collectTagNames(value: UnrealTupleValue): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectTagNames);
  }

  if (typeof value === 'object' && value !== null) {
    const tagName = value['TagName'];
    return [
      ...(typeof tagName === 'string' && tagName.length > 0 ? [tagName] : []),
      ...Object.entries(value)
        .filter(([key]) => key !== 'TagName')
        .flatMap(([, nestedValue]) => collectTagNames(nestedValue))
    ];
  }

  return [];
}

function uniqueSorted<TValue extends string>(values: Iterable<TValue>): TValue[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function uniqueInOrder<TValue extends string>(values: Iterable<TValue>): TValue[] {
  return [...new Set(values)];
}

function positiveNumberField(record: RawRecord, key: string): number | undefined {
  const value = numberField(record, key);
  return value !== undefined && value > 0 ? value : undefined;
}

function requiredString(record: RawRecord, key: string): string {
  const value = stringField(record, key);
  if (!value) {
    throw new Error(`Expected ${key} on raw docs class`);
  }
  return value;
}

function classNameField(record: RawRecord, key: string): string | undefined {
  const value = stringField(record, key);
  return value ? extractClassNameFromReference(value) : undefined;
}

function generatorFuelOptionId(generatorId: MachineId, fuelItemId: ItemId): string {
  return `${generatorId}:${fuelItemId}`;
}

function stringField(record: RawRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(record: RawRecord, key: string): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRawDocsGroup(value: unknown): value is RawDocsGroup {
  return isRawRecord(value) && Array.isArray(value['Classes']);
}

function isRawRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
