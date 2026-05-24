import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  buildGeneratorFuelCatalog,
  scaleGeneratorFuelOption,
  scaleGeneratorFuelOptionForPower,
} from '@beltwise/planner-core';

describe('power catalog', () => {
  it('builds sorted catalog rows with display names', () => {
    const catalog = buildGeneratorFuelCatalog(powerDataset());

    expect(
      catalog.map((row) => [
        row.optionId,
        row.generatorDisplayName,
        row.fuelItemDisplayName,
        row.generatorCountBasis,
      ]),
    ).toEqual([
      ['Build_GeneratorCoal_C:Desc_Coal_C', 'Coal Generator', 'Coal', 'per-generator'],
      ['Build_GeneratorFuel_C:Desc_LiquidFuel_C', 'Fuel Generator', 'Fuel', 'per-generator'],
      [
        'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C',
        'Nuclear Power Plant',
        'Uranium Fuel Rod',
        'per-generator',
      ],
    ]);
  });

  it('scales coal generator fuel, water, and power by generator count', () => {
    const coal = requiredCatalogRow(powerDataset(), 'Build_GeneratorCoal_C:Desc_Coal_C');
    const scaled = scaleGeneratorFuelOption(coal, 16);

    expect(scaled).toMatchObject({
      generatorCount: 16,
      powerMw: 1200,
      fuelConsumedPerMinute: 240,
      supplementalInputs: [
        {
          itemId: 'Desc_Water_C',
          itemDisplayName: 'Water',
          amountPerMinute: 720,
        },
      ],
      byproducts: [],
    });
  });

  it('scales fuel generators from a target power amount', () => {
    const fuel = requiredCatalogRow(powerDataset(), 'Build_GeneratorFuel_C:Desc_LiquidFuel_C');
    const scaled = scaleGeneratorFuelOptionForPower(fuel, 10_000);

    expect(scaled).toMatchObject({
      generatorCount: 40,
      powerMw: 10_000,
      fuelConsumedPerMinute: 800,
      supplementalInputs: [],
      byproducts: [],
    });
  });

  it('scales nuclear generator waste byproducts', () => {
    const nuclear = requiredCatalogRow(
      powerDataset(),
      'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C',
    );
    const scaled = scaleGeneratorFuelOption(nuclear, 2);

    expect(scaled).toMatchObject({
      generatorCount: 2,
      powerMw: 5000,
      fuelConsumedPerMinute: 0.4,
      byproducts: [
        {
          itemId: 'Desc_NuclearWaste_C',
          itemDisplayName: 'Uranium Waste',
          amountPerMinute: 20,
        },
      ],
    });
  });

  it('uses ids as labels when referenced machines or items are missing', () => {
    const catalog = buildGeneratorFuelCatalog({
      ...powerDataset(),
      generatorFuelOptions: {
        'Build_MissingGenerator_C:Desc_MissingFuel_C': {
          id: 'Build_MissingGenerator_C:Desc_MissingFuel_C',
          generatorId: 'Build_MissingGenerator_C',
          fuelItemId: 'Desc_MissingFuel_C',
          powerMw: 100,
          fuelConsumedPerMinute: 5,
          supplementalInputs: [{ itemId: 'Desc_MissingInput_C', amountPerMinute: 7 }],
          byproducts: [{ itemId: 'Desc_MissingWaste_C', amountPerMinute: 2 }],
        },
      },
    });

    expect(catalog).toEqual([
      {
        optionId: 'Build_MissingGenerator_C:Desc_MissingFuel_C',
        generatorId: 'Build_MissingGenerator_C',
        generatorDisplayName: 'Build_MissingGenerator_C',
        fuelItemId: 'Desc_MissingFuel_C',
        fuelItemDisplayName: 'Desc_MissingFuel_C',
        generatorCountBasis: 'per-generator',
        powerMwPerGenerator: 100,
        fuelConsumedPerGeneratorPerMinute: 5,
        supplementalInputsPerGenerator: [
          {
            itemId: 'Desc_MissingInput_C',
            itemDisplayName: 'Desc_MissingInput_C',
            amountPerGeneratorPerMinute: 7,
          },
        ],
        byproductsPerGenerator: [
          {
            itemId: 'Desc_MissingWaste_C',
            itemDisplayName: 'Desc_MissingWaste_C',
            amountPerGeneratorPerMinute: 2,
          },
        ],
      },
    ]);
  });
});

function requiredCatalogRow(dataset: GameDataset, optionId: string) {
  const row = buildGeneratorFuelCatalog(dataset).find(
    (catalogRow) => catalogRow.optionId === optionId,
  );
  expect(row).toBeDefined();
  return row!;
}

function powerDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Coal_C: {
        id: 'Desc_Coal_C',
        className: 'Desc_Coal_C',
        displayName: 'Coal',
        form: 'solid',
      },
      Desc_LiquidFuel_C: {
        id: 'Desc_LiquidFuel_C',
        className: 'Desc_LiquidFuel_C',
        displayName: 'Fuel',
        form: 'liquid',
      },
      Desc_NuclearFuelRod_C: {
        id: 'Desc_NuclearFuelRod_C',
        className: 'Desc_NuclearFuelRod_C',
        displayName: 'Uranium Fuel Rod',
        form: 'solid',
      },
      Desc_NuclearWaste_C: {
        id: 'Desc_NuclearWaste_C',
        className: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        form: 'solid',
      },
      Desc_Water_C: {
        id: 'Desc_Water_C',
        className: 'Desc_Water_C',
        displayName: 'Water',
        form: 'liquid',
      },
    },
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_GeneratorCoal_C: {
        id: 'Build_GeneratorCoal_C',
        className: 'Build_GeneratorCoal_C',
        displayName: 'Coal Generator',
        type: 'generator',
        powerMw: 75,
      },
      Build_GeneratorFuel_C: {
        id: 'Build_GeneratorFuel_C',
        className: 'Build_GeneratorFuel_C',
        displayName: 'Fuel Generator',
        type: 'generator',
        powerMw: 250,
      },
      Build_GeneratorNuclear_C: {
        id: 'Build_GeneratorNuclear_C',
        className: 'Build_GeneratorNuclear_C',
        displayName: 'Nuclear Power Plant',
        type: 'generator',
        powerMw: 2500,
      },
    },
    generatorFuelOptions: {
      'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C': {
        id: 'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C',
        generatorId: 'Build_GeneratorNuclear_C',
        fuelItemId: 'Desc_NuclearFuelRod_C',
        powerMw: 2500,
        fuelConsumedPerMinute: 0.2,
        supplementalInputs: [],
        byproducts: [{ itemId: 'Desc_NuclearWaste_C', amountPerMinute: 10 }],
      },
      'Build_GeneratorFuel_C:Desc_LiquidFuel_C': {
        id: 'Build_GeneratorFuel_C:Desc_LiquidFuel_C',
        generatorId: 'Build_GeneratorFuel_C',
        fuelItemId: 'Desc_LiquidFuel_C',
        powerMw: 250,
        fuelConsumedPerMinute: 20,
        supplementalInputs: [],
        byproducts: [],
      },
      'Build_GeneratorCoal_C:Desc_Coal_C': {
        id: 'Build_GeneratorCoal_C:Desc_Coal_C',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_Coal_C',
        powerMw: 75,
        fuelConsumedPerMinute: 15,
        supplementalInputs: [{ itemId: 'Desc_Water_C', amountPerMinute: 45 }],
        byproducts: [],
      },
    },
  };
}
