import { type GameDataset, gameDatasetSchema } from './schema';

export const tinySatisfactoryDataset = gameDatasetSchema.parse({
  id: 'satisfactory-tiny-fixture',
  game: 'satisfactory',
  gameVersionLabel: 'fixture',
  generatedAt: '2026-05-12T00:00:00.000Z',
  source: {
    docsFileName: 'tiny-fixture',
    fingerprint: 'fixture'
  },
  items: {
    Desc_CopperIngot_C: {
      id: 'Desc_CopperIngot_C',
      className: 'Desc_CopperIngot_C',
      displayName: 'Copper Ingot',
      form: 'solid'
    },
    Desc_OreCopper_C: {
      id: 'Desc_OreCopper_C',
      className: 'Desc_OreCopper_C',
      displayName: 'Copper Ore',
      form: 'solid'
    },
    Desc_IngotIron_C: {
      id: 'Desc_IngotIron_C',
      className: 'Desc_IngotIron_C',
      displayName: 'Iron Ingot',
      form: 'solid'
    },
    Desc_IronPlate_C: {
      id: 'Desc_IronPlate_C',
      className: 'Desc_IronPlate_C',
      displayName: 'Iron Plate',
      form: 'solid'
    },
    Desc_IronRod_C: {
      id: 'Desc_IronRod_C',
      className: 'Desc_IronRod_C',
      displayName: 'Iron Rod',
      form: 'solid'
    },
    Desc_OreIron_C: {
      id: 'Desc_OreIron_C',
      className: 'Desc_OreIron_C',
      displayName: 'Iron Ore',
      form: 'solid'
    },
    Desc_ReinforcedIronPlate_C: {
      id: 'Desc_ReinforcedIronPlate_C',
      className: 'Desc_ReinforcedIronPlate_C',
      displayName: 'Reinforced Iron Plate',
      form: 'solid'
    },
    Desc_Screw_C: {
      id: 'Desc_Screw_C',
      className: 'Desc_Screw_C',
      displayName: 'Screw',
      form: 'solid'
    },
    Desc_Wire_C: {
      id: 'Desc_Wire_C',
      className: 'Desc_Wire_C',
      displayName: 'Wire',
      form: 'solid'
    }
  },
  recipes: {
    Recipe_CopperIngot_C: {
      id: 'Recipe_CopperIngot_C',
      className: 'Recipe_CopperIngot_C',
      displayName: 'Copper Ingot',
      ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 1 }],
      products: [{ itemId: 'Desc_CopperIngot_C', amount: 1 }],
      durationSeconds: 2,
      producedIn: ['Build_SmelterMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_IronIngot_C: {
      id: 'Recipe_IronIngot_C',
      className: 'Recipe_IronIngot_C',
      displayName: 'Iron Ingot',
      ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
      products: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
      durationSeconds: 2,
      producedIn: ['Build_SmelterMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_IronPlate_C: {
      id: 'Recipe_IronPlate_C',
      className: 'Recipe_IronPlate_C',
      displayName: 'Iron Plate',
      ingredients: [{ itemId: 'Desc_IngotIron_C', amount: 2 }],
      products: [{ itemId: 'Desc_IronPlate_C', amount: 1 }],
      durationSeconds: 6,
      producedIn: ['Build_ConstructorMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_IronRod_C: {
      id: 'Recipe_IronRod_C',
      className: 'Recipe_IronRod_C',
      displayName: 'Iron Rod',
      ingredients: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
      products: [{ itemId: 'Desc_IronRod_C', amount: 1 }],
      durationSeconds: 4,
      producedIn: ['Build_ConstructorMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_IronWire_C: {
      id: 'Recipe_IronWire_C',
      className: 'Recipe_IronWire_C',
      displayName: 'Alternate: Iron Wire',
      ingredients: [{ itemId: 'Desc_IngotIron_C', amount: 5 }],
      products: [{ itemId: 'Desc_Wire_C', amount: 9 }],
      durationSeconds: 24,
      producedIn: ['Build_ConstructorMk1_C'],
      isAlternate: true,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_ReinforcedIronPlate_C: {
      id: 'Recipe_ReinforcedIronPlate_C',
      className: 'Recipe_ReinforcedIronPlate_C',
      displayName: 'Reinforced Iron Plate',
      ingredients: [
        { itemId: 'Desc_IronPlate_C', amount: 6 },
        { itemId: 'Desc_Screw_C', amount: 12 }
      ],
      products: [{ itemId: 'Desc_ReinforcedIronPlate_C', amount: 1 }],
      durationSeconds: 12,
      producedIn: ['Build_AssemblerMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_Screw_C: {
      id: 'Recipe_Screw_C',
      className: 'Recipe_Screw_C',
      displayName: 'Screw',
      ingredients: [{ itemId: 'Desc_IronRod_C', amount: 1 }],
      products: [{ itemId: 'Desc_Screw_C', amount: 4 }],
      durationSeconds: 6,
      producedIn: ['Build_ConstructorMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    },
    Recipe_Wire_C: {
      id: 'Recipe_Wire_C',
      className: 'Recipe_Wire_C',
      displayName: 'Wire',
      ingredients: [{ itemId: 'Desc_CopperIngot_C', amount: 1 }],
      products: [{ itemId: 'Desc_Wire_C', amount: 2 }],
      durationSeconds: 4,
      producedIn: ['Build_ConstructorMk1_C'],
      isAlternate: false,
      isHandCraftOnly: false,
      tags: []
    }
  },
  machines: {
    Build_AssemblerMk1_C: {
      id: 'Build_AssemblerMk1_C',
      className: 'Build_AssemblerMk1_C',
      displayName: 'Assembler',
      type: 'manufacturer',
      powerMw: 15,
      manufacturingSpeed: 1
    },
    Build_ConstructorMk1_C: {
      id: 'Build_ConstructorMk1_C',
      className: 'Build_ConstructorMk1_C',
      displayName: 'Constructor',
      type: 'manufacturer',
      powerMw: 4,
      manufacturingSpeed: 1
    },
    Build_MinerMk1_C: {
      id: 'Build_MinerMk1_C',
      className: 'Build_MinerMk1_C',
      displayName: 'Miner Mk.1',
      type: 'extractor',
      powerMw: 5,
      manufacturingSpeed: 1
    },
    Build_SmelterMk1_C: {
      id: 'Build_SmelterMk1_C',
      className: 'Build_SmelterMk1_C',
      displayName: 'Smelter',
      type: 'manufacturer',
      powerMw: 4,
      manufacturingSpeed: 1
    }
  },
  resources: {
    Desc_OreCopper_C: {
      itemId: 'Desc_OreCopper_C',
      displayName: 'Copper Ore',
      extraction: {
        allowedExtractors: ['Build_MinerMk1_C'],
        baselineMaxPerMinute: 300,
        notes: 'Fixture cap for early planning tests.'
      }
    },
    Desc_OreIron_C: {
      itemId: 'Desc_OreIron_C',
      displayName: 'Iron Ore',
      extraction: {
        allowedExtractors: ['Build_MinerMk1_C'],
        baselineMaxPerMinute: 600,
        notes: 'Fixture cap for early planning tests.'
      }
    }
  },
  schematics: {}
}) satisfies GameDataset;
