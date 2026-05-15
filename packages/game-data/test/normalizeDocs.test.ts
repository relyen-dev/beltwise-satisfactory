import { describe, expect, it } from 'vitest';
import { normalizeDocs } from '@beltwise/game-data';

const itemClassRef = (className: string): string =>
  `/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/${className}.${className}'`;

const machineClassRef = (className: string): string =>
  `/Game/FactoryGame/Buildable/Factory/${className}.${className}`;

function itemAmounts(...amounts: ReadonlyArray<readonly [string, number]>): string {
  return `(${amounts
    .map(([className, amount]) => `(ItemClass="${itemClassRef(className)}",Amount=${amount})`)
    .join(',')})`;
}

function producedIn(...machineIds: string[]): string {
  return `(${machineIds.map((machineId) => `"${machineClassRef(machineId)}"`).join(',')})`;
}

describe('normalizeDocs', () => {
  it('extracts planner-relevant items, machines, and automated recipes', () => {
    const rawDocs = [
      {
        NativeClass: '/Script/FactoryGame.FGItemDescriptor',
        Classes: [
          {
            ClassName: 'Desc_IronPlate_C',
            mDisplayName: 'Iron Plate',
            mForm: 'RF_SOLID'
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGResourceDescriptor',
        Classes: [
          {
            ClassName: 'Desc_OreIron_C',
            mDisplayName: 'Iron Ore',
            mForm: 'RF_SOLID'
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGBuildableManufacturer',
        Classes: [
          {
            ClassName: 'Build_ConstructorMk1_C',
            mDisplayName: 'Constructor',
            mPowerConsumption: '4',
            mManufacturingSpeed: '1'
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGRecipe',
        Classes: [
          {
            ClassName: 'Recipe_IronPlate_C',
            mDisplayName: 'Iron Plate',
            mIngredients:
              '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/Parts/Desc_OreIron.Desc_OreIron_C\'",Amount=2))',
            mProduct:
              '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/Parts/Desc_IronPlate.Desc_IronPlate_C\'",Amount=1))',
            mManufactoringDuration: '6',
            mProducedIn:
              '(/Script/Engine.BlueprintGeneratedClass\'/Game/Factory/Build_ConstructorMk1.Build_ConstructorMk1_C\')'
          },
          {
            ClassName: 'Recipe_Alternate_IronWire_C',
            mDisplayName: 'Alternate: Iron Wire',
            mIngredients: '()',
            mProduct: '()',
            mManufactoringDuration: '1',
            mProducedIn:
              '(/Script/Engine.BlueprintGeneratedClass\'/Game/Factory/Build_ConstructorMk1.Build_ConstructorMk1_C\')'
          },
          {
            ClassName: 'Recipe_HandOnly_C',
            mDisplayName: 'Hand Only',
            mIngredients: '()',
            mProduct: '()',
            mManufactoringDuration: '1',
            mProducedIn: '()'
          }
        ]
      }
    ];

    const normalized = normalizeDocs(rawDocs, JSON.stringify(rawDocs), {
      docsFileName: 'en-US.json',
      generatedAt: '2026-05-12T00:00:00.000Z'
    });

    expect(Object.keys(normalized.items)).toContain('Desc_IronPlate_C');
    expect(normalized.machines['Build_ConstructorMk1_C']?.displayName).toBe('Constructor');
    expect(normalized.recipes['Recipe_IronPlate_C']?.ingredients).toEqual([
      { itemId: 'Desc_OreIron_C', amount: 2 }
    ]);
    expect(normalized.recipes['Recipe_Alternate_IronWire_C']?.isAlternate).toBe(true);
    expect(normalized.recipes['Recipe_HandOnly_C']).toBeUndefined();
  });

  it('parses known early automated production recipes from raw docs tuples', () => {
    const rawDocs = [
      {
        NativeClass: '/Script/FactoryGame.FGItemDescriptor',
        Classes: [
          { ClassName: 'Desc_IngotIron_C', mDisplayName: 'Iron Ingot', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_IronPlate_C', mDisplayName: 'Iron Plate', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_IronRod_C', mDisplayName: 'Iron Rod', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_IronScrew_C', mDisplayName: 'Screw', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_Snow_C', mDisplayName: 'FICSMAS Actual Snow', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_XmasDataCartridge1_C', mDisplayName: 'FICSMAS Data Cartridge Day 1', mForm: 'RF_SOLID' },
          {
            ClassName: 'Desc_IronPlateReinforced_C',
            mDisplayName: 'Reinforced Iron Plate',
            mForm: 'RF_SOLID'
          },
          { ClassName: 'Desc_Rubber_C', mDisplayName: 'Rubber', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_HeavyOilResidue_C', mDisplayName: 'Heavy Oil Residue', mForm: 'RF_LIQUID' },
          { ClassName: 'Desc_Gunpowder_C', mDisplayName: 'Black Powder', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_SteelPipe_C', mDisplayName: 'Steel Pipe', mForm: 'RF_SOLID' }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGResourceDescriptor',
        Classes: [
          { ClassName: 'Desc_OreIron_C', mDisplayName: 'Iron Ore', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_LiquidOil_C', mDisplayName: 'Crude Oil', mForm: 'RF_LIQUID' },
          { ClassName: 'Desc_Stone_C', mDisplayName: 'Limestone', mForm: 'RF_SOLID' },
          { ClassName: 'Desc_Water_C', mDisplayName: 'Water', mForm: 'RF_LIQUID' }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGAmmoTypeProjectile',
        Classes: [
          { ClassName: 'Desc_NobeliskExplosive_C', mDisplayName: 'Nobelisk', mForm: 'RF_SOLID' },
          {
            ClassName: 'Desc_SnowballProjectile_C',
            FullName:
              'BlueprintGeneratedClass /Game/FactoryGame/Events/Christmas/Parts/Desc_SnowballProjectile.Desc_SnowballProjectile_C',
            mDisplayName: 'Snowball',
            mForm: 'RF_SOLID'
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGEquipmentDescriptor',
        Classes: [
          { ClassName: 'BP_ItemDescriptorPortableMiner_C', mDisplayName: 'Portable Miner', mForm: 'RF_SOLID' }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGBuildableManufacturer',
        Classes: [
          {
            ClassName: 'Build_ConstructorMk1_C',
            mDisplayName: 'Constructor',
            mPowerConsumption: '4.000000',
            mManufacturingSpeed: '1.000000'
          },
          {
            ClassName: 'Build_SmelterMk1_C',
            mDisplayName: 'Smelter',
            mPowerConsumption: '4.000000',
            mManufacturingSpeed: '1.000000'
          },
          {
            ClassName: 'Build_AssemblerMk1_C',
            mDisplayName: 'Assembler',
            mPowerConsumption: '15.000000',
            mManufacturingSpeed: '1.000000'
          },
          {
            ClassName: 'Build_OilRefinery_C',
            mDisplayName: 'Refinery',
            mPowerConsumption: '30.000000',
            mManufacturingSpeed: '1.000000'
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGBuildableResourceExtractor',
        Classes: [
          {
            ClassName: 'Build_MinerMk1_C',
            mDisplayName: 'Miner Mk.1',
            mPowerConsumption: '5.000000',
            mExtractCycleTime: '1.000000',
            mItemsPerCycle: '1',
            mAllowedResourceForms: '(RF_SOLID)',
            mAllowedResources: ''
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGBuildableWaterPump',
        Classes: [
          {
            ClassName: 'Build_WaterPump_C',
            mDisplayName: 'Water Extractor',
            mPowerConsumption: '20.000000',
            mExtractCycleTime: '1.000000',
            mItemsPerCycle: '2',
            mAllowedResourceForms: '(RF_LIQUID)',
            mAllowedResources: ''
          }
        ]
      },
      {
        NativeClass: '/Script/FactoryGame.FGRecipe',
        Classes: [
          {
            ClassName: 'Recipe_IngotIron_C',
            mDisplayName: 'Iron Ingot',
            mIngredients: itemAmounts(['Desc_OreIron_C', 1]),
            mProduct: itemAmounts(['Desc_IngotIron_C', 1]),
            mManufactoringDuration: '2.000000',
            mProducedIn: producedIn('Build_SmelterMk1_C'),
            mGameplayTags: '(GameplayTags=((TagName="Recipe.Part")))'
          },
          {
            ClassName: 'Recipe_ExtractIronOre_C',
            mDisplayName: 'Iron Ore',
            mIngredients: '()',
            mProduct: itemAmounts(['Desc_OreIron_C', 1]),
            mManufactoringDuration: '1.000000',
            mProducedIn: producedIn('Build_MinerMk1_C')
          },
          {
            ClassName: 'Recipe_IronPlate_C',
            mDisplayName: 'Iron Plate',
            mIngredients: itemAmounts(['Desc_IngotIron_C', 3]),
            mProduct: itemAmounts(['Desc_IronPlate_C', 2]),
            mManufactoringDuration: '6.000000',
            mProducedIn: producedIn('Build_ConstructorMk1_C'),
            mGameplayTags: '(GameplayTags=((TagName="Recipe.Part")))'
          },
          {
            ClassName: 'Recipe_IronRod_C',
            mDisplayName: 'Iron Rod',
            mIngredients: itemAmounts(['Desc_IngotIron_C', 1]),
            mProduct: itemAmounts(['Desc_IronRod_C', 1]),
            mManufactoringDuration: '4.000000',
            mProducedIn: producedIn('Build_ConstructorMk1_C')
          },
          {
            ClassName: 'Recipe_Screw_C',
            mDisplayName: 'Screws',
            mIngredients: itemAmounts(['Desc_IronRod_C', 1]),
            mProduct: itemAmounts(['Desc_IronScrew_C', 4]),
            mManufactoringDuration: '6.000000',
            mProducedIn: producedIn('Build_ConstructorMk1_C')
          },
          {
            ClassName: 'Recipe_IronPlateReinforced_C',
            mDisplayName: 'Reinforced Iron Plate',
            mIngredients: itemAmounts(['Desc_IronPlate_C', 6], ['Desc_IronScrew_C', 12]),
            mProduct: itemAmounts(['Desc_IronPlateReinforced_C', 1]),
            mManufactoringDuration: '12.000000',
            mProducedIn: producedIn('Build_AssemblerMk1_C')
          },
          {
            ClassName: 'Recipe_XenoZapper_C',
            mDisplayName: 'Xeno-Zapper',
            mIngredients: itemAmounts(['Desc_IronRod_C', 10]),
            mProduct: itemAmounts(['BP_EquipmentDescriptorShockShank_C', 1]),
            mManufactoringDuration: '40.000000',
            mProducedIn: producedIn('BP_WorkshopComponent_C')
          },
          {
            ClassName: 'Recipe_Alternate_AutomatedMiner_C',
            mDisplayName: 'Alternate: Automated Miner',
            mIngredients: itemAmounts(['Desc_IronPlate_C', 4]),
            mProduct: itemAmounts(['BP_ItemDescriptorPortableMiner_C', 1]),
            mManufactoringDuration: '20.000000',
            mProducedIn: producedIn('Build_AssemblerMk1_C')
          },
          {
            ClassName: 'Recipe_Nobelisk_C',
            mDisplayName: 'Nobelisk',
            mIngredients: itemAmounts(['Desc_Gunpowder_C', 2], ['Desc_SteelPipe_C', 2]),
            mProduct: itemAmounts(['Desc_NobeliskExplosive_C', 1]),
            mManufactoringDuration: '6.000000',
            mProducedIn: producedIn('Build_AssemblerMk1_C')
          },
          {
            ClassName: 'Recipe_Rubber_C',
            mDisplayName: 'Residual Rubber',
            mIngredients: itemAmounts(['Desc_LiquidOil_C', 3000]),
            mProduct: itemAmounts(['Desc_Rubber_C', 2], ['Desc_HeavyOilResidue_C', 2000]),
            mManufactoringDuration: '6.000000',
            mProducedIn: producedIn('Build_Refinery_C')
          },
          {
            ClassName: 'Recipe_XmasDataCartridge1_C',
            FullName:
              'BlueprintGeneratedClass /Game/FactoryGame/Events/Christmas/Parts/Recipe_XmasDataCartridge1.Recipe_XmasDataCartridge1_C',
            mDisplayName: 'FICSMAS Data Cartridge Day 1',
            mIngredients: itemAmounts(['Desc_IronPlate_C', 1]),
            mProduct: itemAmounts(['Desc_XmasDataCartridge1_C', 1]),
            mManufactoringDuration: '1.000000',
            mProducedIn: producedIn('Build_ConstructorMk1_C')
          },
          {
            ClassName: 'Recipe_Snowball_C',
            mDisplayName: 'Snowball',
            mIngredients: itemAmounts(['Desc_Snow_C', 3]),
            mProduct: itemAmounts(['Desc_SnowballProjectile_C', 1]),
            mManufactoringDuration: '3.000000',
            mProducedIn: producedIn('Build_ConstructorMk1_C')
          }
        ]
      }
    ];

    const normalized = normalizeDocs(rawDocs, JSON.stringify(rawDocs), {
      docsFileName: 'en-US.json',
      generatedAt: '2026-05-12T00:00:00.000Z'
    });

    expect(normalized.recipes['Recipe_IngotIron_C']).toMatchObject({
      displayName: 'Iron Ingot',
      ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
      products: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
      durationSeconds: 2,
      producedIn: ['Build_SmelterMk1_C'],
      isAlternate: false,
      tags: ['Recipe.Part']
    });
    expect(normalized.recipes['Recipe_ExtractIronOre_C']).toBeUndefined();
    expect(normalized.recipes['Recipe_IronPlate_C']?.ingredients).toEqual([
      { itemId: 'Desc_IngotIron_C', amount: 3 }
    ]);
    expect(normalized.recipes['Recipe_IronPlate_C']?.products).toEqual([
      { itemId: 'Desc_IronPlate_C', amount: 2 }
    ]);
    expect(normalized.recipes['Recipe_IronRod_C']?.durationSeconds).toBe(4);
    expect(normalized.recipes['Recipe_Screw_C']?.products).toEqual([
      { itemId: 'Desc_IronScrew_C', amount: 4 }
    ]);
    expect(normalized.recipes['Recipe_IronPlateReinforced_C']).toMatchObject({
      ingredients: [
        { itemId: 'Desc_IronPlate_C', amount: 6 },
        { itemId: 'Desc_IronScrew_C', amount: 12 }
      ],
      products: [{ itemId: 'Desc_IronPlateReinforced_C', amount: 1 }],
      producedIn: ['Build_AssemblerMk1_C']
    });
    expect(normalized.recipes['Recipe_XenoZapper_C']).toBeUndefined();
    expect(normalized.recipes['Recipe_Alternate_AutomatedMiner_C']).toMatchObject({
      products: [{ itemId: 'BP_ItemDescriptorPortableMiner_C', amount: 1 }],
      isAlternate: true
    });
    expect(normalized.recipes['Recipe_Nobelisk_C']).toMatchObject({
      products: [{ itemId: 'Desc_NobeliskExplosive_C', amount: 1 }],
      producedIn: ['Build_AssemblerMk1_C']
    });
    expect(normalized.recipes['Recipe_Rubber_C']).toMatchObject({
      displayName: 'Residual Rubber',
      ingredients: [{ itemId: 'Desc_LiquidOil_C', amount: 3 }],
      products: [
        { itemId: 'Desc_Rubber_C', amount: 2 },
        { itemId: 'Desc_HeavyOilResidue_C', amount: 2 }
      ],
      producedIn: ['Build_OilRefinery_C']
    });
    expect(normalized.recipes['Recipe_XmasDataCartridge1_C']).toBeUndefined();
    expect(normalized.recipes['Recipe_Snowball_C']).toBeUndefined();
    expect(normalized.items['BP_EquipmentDescriptorShockShank_C']).toBeUndefined();
    expect(normalized.items['BP_ItemDescriptorPortableMiner_C']?.displayName).toBe('Portable Miner');
    expect(normalized.items['Desc_NobeliskExplosive_C']?.displayName).toBe('Nobelisk');
    expect(normalized.items['Desc_XmasDataCartridge1_C']).toBeUndefined();
    expect(normalized.items['Desc_Snow_C']).toBeUndefined();
    expect(normalized.items['Desc_SnowballProjectile_C']).toBeUndefined();
    expect(normalized.machines['Build_MinerMk1_C']?.extraction).toMatchObject({
      amountPerCycle: 1,
      cycleTimeSeconds: 1,
      amountPerMinute: 60,
      allowedResourceForms: ['solid']
    });
    expect(normalized.resources['Desc_OreIron_C']?.extraction?.allowedExtractors).toContain(
      'Build_MinerMk1_C',
    );
    expect(normalized.resources['Desc_OreIron_C']?.extraction?.baselineMaxPerMinute).toBe(92100);
    expect(normalized.resources['Desc_Stone_C']?.extraction?.baselineMaxPerMinute).toBe(69300);
    expect(normalized.resources['Desc_Water_C']?.extraction).toMatchObject({
      allowedExtractors: ['Build_WaterPump_C'],
      baselineMaxPerMinute: Number.MAX_SAFE_INTEGER
    });
  });
});
