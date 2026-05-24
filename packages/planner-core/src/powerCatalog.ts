import type { GameDataset, ItemId, MachineId } from '@beltwise/game-data';

export interface GeneratorFuelCatalogItemRate {
  readonly itemId: ItemId;
  readonly itemDisplayName: string;
  readonly amountPerGeneratorPerMinute: number;
}

export interface GeneratorFuelCatalogRow {
  readonly optionId: string;
  readonly generatorId: MachineId;
  readonly generatorDisplayName: string;
  readonly fuelItemId: ItemId;
  readonly fuelItemDisplayName: string;
  readonly generatorCountBasis: 'per-generator';
  readonly powerMwPerGenerator: number;
  readonly fuelConsumedPerGeneratorPerMinute: number;
  readonly supplementalInputsPerGenerator: readonly GeneratorFuelCatalogItemRate[];
  readonly byproductsPerGenerator: readonly GeneratorFuelCatalogItemRate[];
}

export interface ScaledGeneratorFuelCatalogItemRate {
  readonly itemId: ItemId;
  readonly itemDisplayName: string;
  readonly amountPerMinute: number;
}

export interface ScaledGeneratorFuelCatalogRow {
  readonly optionId: string;
  readonly generatorId: MachineId;
  readonly generatorDisplayName: string;
  readonly fuelItemId: ItemId;
  readonly fuelItemDisplayName: string;
  readonly generatorCount: number;
  readonly powerMw: number;
  readonly fuelConsumedPerMinute: number;
  readonly supplementalInputs: readonly ScaledGeneratorFuelCatalogItemRate[];
  readonly byproducts: readonly ScaledGeneratorFuelCatalogItemRate[];
}

export function buildGeneratorFuelCatalog(dataset: GameDataset): GeneratorFuelCatalogRow[] {
  return Object.values(dataset.generatorFuelOptions)
    .map((option) => ({
      optionId: option.id,
      generatorId: option.generatorId,
      generatorDisplayName: machineDisplayName(dataset, option.generatorId),
      fuelItemId: option.fuelItemId,
      fuelItemDisplayName: itemDisplayName(dataset, option.fuelItemId),
      generatorCountBasis: 'per-generator' as const,
      powerMwPerGenerator: option.powerMw,
      fuelConsumedPerGeneratorPerMinute: option.fuelConsumedPerMinute,
      supplementalInputsPerGenerator: buildCatalogItemRates(dataset, option.supplementalInputs),
      byproductsPerGenerator: buildCatalogItemRates(dataset, option.byproducts),
    }))
    .toSorted(compareGeneratorFuelCatalogRows);
}

export function scaleGeneratorFuelOption(
  row: GeneratorFuelCatalogRow,
  generatorCount: number,
): ScaledGeneratorFuelCatalogRow {
  const safeGeneratorCount = nonnegativeFinite(generatorCount, 'generatorCount');

  return {
    optionId: row.optionId,
    generatorId: row.generatorId,
    generatorDisplayName: row.generatorDisplayName,
    fuelItemId: row.fuelItemId,
    fuelItemDisplayName: row.fuelItemDisplayName,
    generatorCount: safeGeneratorCount,
    powerMw: row.powerMwPerGenerator * safeGeneratorCount,
    fuelConsumedPerMinute: row.fuelConsumedPerGeneratorPerMinute * safeGeneratorCount,
    supplementalInputs: row.supplementalInputsPerGenerator.map((input) =>
      scaleCatalogItemRate(input, safeGeneratorCount),
    ),
    byproducts: row.byproductsPerGenerator.map((byproduct) =>
      scaleCatalogItemRate(byproduct, safeGeneratorCount),
    ),
  };
}

export function scaleGeneratorFuelOptionForPower(
  row: GeneratorFuelCatalogRow,
  targetPowerMw: number,
): ScaledGeneratorFuelCatalogRow {
  const safeTargetPowerMw = nonnegativeFinite(targetPowerMw, 'targetPowerMw');
  return scaleGeneratorFuelOption(row, safeTargetPowerMw / row.powerMwPerGenerator);
}

function buildCatalogItemRates(
  dataset: GameDataset,
  rates: readonly { itemId: ItemId; amountPerMinute: number }[],
): GeneratorFuelCatalogItemRate[] {
  return rates
    .map((rate) => ({
      itemId: rate.itemId,
      itemDisplayName: itemDisplayName(dataset, rate.itemId),
      amountPerGeneratorPerMinute: rate.amountPerMinute,
    }))
    .toSorted(compareCatalogItemRates);
}

function scaleCatalogItemRate(
  rate: GeneratorFuelCatalogItemRate,
  generatorCount: number,
): ScaledGeneratorFuelCatalogItemRate {
  return {
    itemId: rate.itemId,
    itemDisplayName: rate.itemDisplayName,
    amountPerMinute: rate.amountPerGeneratorPerMinute * generatorCount,
  };
}

function compareGeneratorFuelCatalogRows(
  left: GeneratorFuelCatalogRow,
  right: GeneratorFuelCatalogRow,
): number {
  return (
    left.generatorDisplayName.localeCompare(right.generatorDisplayName) ||
    left.fuelItemDisplayName.localeCompare(right.fuelItemDisplayName) ||
    left.optionId.localeCompare(right.optionId)
  );
}

function compareCatalogItemRates(
  left: GeneratorFuelCatalogItemRate,
  right: GeneratorFuelCatalogItemRate,
): number {
  return (
    left.itemDisplayName.localeCompare(right.itemDisplayName) ||
    left.itemId.localeCompare(right.itemId)
  );
}

function itemDisplayName(dataset: GameDataset, itemId: ItemId): string {
  return dataset.items[itemId]?.displayName ?? itemId;
}

function machineDisplayName(dataset: GameDataset, machineId: MachineId): string {
  return dataset.machines[machineId]?.displayName ?? machineId;
}

function nonnegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite nonnegative number.`);
  }

  return value;
}
