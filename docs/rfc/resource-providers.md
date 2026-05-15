# RFC: Resource Providers, Save Imports, And Randomized Nodes

Status: Future research

This RFC captures future work for deriving Satisfactory map resource availability from static defaults, user caps, randomized-node seeds, or uploaded save files. It is intentionally separate from the core product spec so the current app can stay focused on data extraction, solving, graph visualization, and local project workflows.

## Goal

Allow Beltwise to calculate map resource limits from multiple sources:

- Static baseline map limits.
- User-edited custom caps.
- Satisfactory 1.2 world-randomization seed/settings.
- A user-uploaded `.sav` file.

The preferred future user experience is seed/settings input, because it is lightweight and privacy-friendly. Save import is the reliable fallback if the game serializes resolved node data but the seed algorithm is hard to reproduce.

## Data Sources

`CommunityResources\Docs\en-US.json` is useful for:

- Resource descriptor IDs and display names.
- Extractor machine data.
- Extraction cycle timing and base items per cycle.
- Allowed resource forms.
- Recipe/building metadata.

It does not appear to include the placed world resource-node catalog:

- No `FGResourceNode` native class bucket was found.
- No resource-node coordinates/transforms were found.
- No default per-node resource type/purity list was found.
- Search hits for `BP_ResourceNode`/`ResourceNode` in `en-US.json` are machine/extractor metadata such as `mParticleMap`, not placed map nodes.

Therefore the base resource-node catalog probably needs to come from one of:

- Game map assets outside `en-US.json`.
- A parsed vanilla/default save file, if it includes placed resource-node actors with transforms.
- A manually curated catalog verified against SCIM-the-site or in-game observations.

Other `CommunityResources` files:

- `FactoryGame.usmap` contains Unreal schema/reflection metadata. String searches show resource-node and randomization fields such as `FGResourceNode`, `mResourceClassOverride`, `mPurityOverride`, `mNodePurity`, `mNodeRandomization`, `mNodePuritySettings`, and `mNodeRandomizationSeed`.
- `Headers.zip` contains generated C++ headers and is very useful for official class/property names and enum values.
- These files do not appear to contain placed resource-node coordinates themselves, but they help design a correct save parser.

Relevant header findings:

- `AFGResourceNodeBase` has saved/replicated `mResourceClassOverride` and original `mResourceClass`.
- `AFGResourceNode` has `mPurity` and saved `mPurityOverride`, with `RP_MAX` used as the no-override value.
- `AFGGameState` saves `mNodeRandomization`, `mNodePuritySettings`, and `mNodeRandomizationSeed`.
- `ENodeRandomizationMode` values:
  - `NRM_None = 0`
  - `NRM_Strict = 1`
  - `NRM_BasicReach = 2`
  - `NRM_AdvancedRich = 3`
  - `NRM_FossilFuelRich = 4`
- `ENodePuritySettings` values:
  - `NPS_NoChange = 0`
  - `NPS_AllPure = 1`
  - `NPS_AllNormal = 2`
  - `NPS_AllImpure = 3`
  - `NPS_AllRandom = 4`
  - `NPS_Increase = 5`
  - `NPS_Decrease = 6`
- `AFGResourceNodeManager` declares `ApplyRandomizationSettings(randomizationMode, puritySettings, seed)`, `CreateDefaultNodeListFromWorld`, `ModifyNodeDistribution`, `GetPurityOverride`, and `Shuffle`.

The headers confirm the algorithm is seed-driven and operates on a default node list built from world actors. They do not expose function bodies.

## Resource Provider Abstraction

Keep all of this behind a `ResourceProvider` abstraction:

```ts
interface ResourceProvider {
  id: string;
  label: string;
  getLimits(dataset: GameDataset): BaselineResourceLimits;
}
```

Future providers:

- `staticBaselineProvider`
- `customCapsProvider`
- `saveFileProvider`
- `randomSeedProvider`

Save-file parsing should become its own package later. Seed-based randomized resources should be treated as speculative until the seed algorithm is known or the save file includes enough resolved node data.

## SCIM Prior Art

AnthorNet's SC-InteractiveMap repository powers Satisfactory Calculator's interactive map and save editor.

Important boundary:

- SCIM's README says reuse of source code and data assets is not permitted and the code is provided for educational purposes.
- Beltwise should not copy code or assets from SCIM.
- SCIM can still be studied to understand file-format concepts, object names, system boundaries, and how resource-node state appears in saves.

Useful observations from SCIM's public code:

- Its save parser uses browser workers, reads the save header/body, inflates compressed chunks, and parses world objects/entities.
- Its parser reads `mapOptions` from the save header.
- Current SCIM behavior appears able to show randomized node distribution after a 1.2 save is loaded. That means the resolved resource-node data is either serialized in the save or reproducible from seed/settings available in the save.
- `src/SubSystem/GameState.js` references likely 1.2 properties in a comment: `mNodeRandomization`, `mNodePuritySettings`, and `mNodeRandomizationSeed`.
- `src/Building/ResourceNode.js` applies per-node save properties named `mResourceClassOverride` and `mPurityOverride` to static resource-node markers.
- That suggests the save likely contains resolved per-node resource/purity overrides after world randomization, while the GameState object carries seed/settings metadata.

## Known Satisfactory 1.2 Inputs

Known Satisfactory 1.2 Experimental world-randomization inputs:

- `Resource Node Randomization`
  - `Default`
  - `Random`
  - `Basic Resource Rich`
  - `Advanced Resource Rich`
  - `Fossil Fuel Rich`
- `Resource Node Purity`
  - `Default`
  - `All Pure`
  - `Mostly Pure`
  - `Average`
  - `Mostly Impure`
  - `All Impure`
  - `Random`
- `World Seed`
  - Patch notes say the vanilla/default world seed is `0`.
  - Some wiki/user references may differ while 1.2 is experimental; verify in-game before baking this into tests.
  - To reproduce a world, users need to share the seed and manually match the other world-randomization settings.

Future `randomSeedProvider` contract:

```ts
interface RandomizedResourceSettings {
  seed: string;
  resourceNodeRandomization:
    | "default"
    | "random"
    | "basicResourceRich"
    | "advancedResourceRich"
    | "fossilFuelRich";
  resourceNodePurity:
    | "default"
    | "allPure"
    | "mostlyPure"
    | "average"
    | "mostlyImpure"
    | "allImpure"
    | "random";
}
```

## Initial Save-File Probe

Probe file:

```txt
C:\Users\eelye\AppData\Local\FactoryGame\Saved\SaveGames\76561198013614185\Resolve_180326-160348.sav
```

This save is a non-random/default-node 1.2 Experimental save.

Observed header:

- Save header type: `14`
- Save version: `58`
- Build version: `480321`
- Session: `Resolve`
- Map name: `Persistent_Level`
- `mapOptions` includes `?skiponboarding` plus account/player identity data.
- `isModdedSave`: `0`
- `isCreativeModeEnabled`: `0`

The save body is chunk-compressed. A PowerShell probe with `DeflateStream` fallback decompressed:

- 27 chunks
- About 3.4 MB inflated body

String scan results in decompressed body:

- `BP_ResourceNode`: present many times.
- `BP_FrackingSatellite`: present many times.
- `BP_FrackingCore`: present.
- `mSpacePartsCostMultiplier`: present once.
- `mResourceClassOverride`: not present.
- `mPurityOverride`: not present.
- `mNodeRandomization`: not present.
- `mNodePuritySettings`: not present.
- `mNodeRandomizationSeed`: not present.

Interpretation:

- The parser/decompression approach works.
- This default save does not include random-node override fields, which is expected.
- A randomized-node test save is needed to determine whether the game serializes resolved overrides.

## Randomized Save-File Probe

Probe file:

```txt
C:\Users\eelye\AppData\Local\FactoryGame\Saved\SaveGames\76561198013614185\BeltwiseSeedTest.sav
```

User-created test conditions:

- Fresh 1.2 Experimental save.
- Space elevator multiplier: `25x`.
- World seed: `1905910528`.
- Resource node randomization: `Random`.
- Resource node purity: `Random`.

Observed header:

- Save header type: `14`
- Save version: `60`
- Build version: `489969`
- Session: `BeltwiseSeedTest`
- Map name: `Persistent_Level`
- `isModdedSave`: `0`
- `isCreativeModeEnabled`: `0`

The save body is chunk-compressed. A PowerShell probe with `DeflateStream` fallback decompressed:

- 15 chunks
- About 1.93 MB inflated body

Important string/value findings in the decompressed body:

- `mSpacePartsCostMultiplier`: present once.
- `25.0` float byte pattern: present once near `mSpacePartsCostMultiplier`.
- `mNodeRandomization`: present.
- `ENodeRandomizationMode::NRM_Strict`: present once.
- `mNodePuritySettings`: present.
- `ENodePuritySettings::NPS_AllRandom`: present once.
- `mNodeRandomizationSeed`: present.
- `1905910528` int byte pattern: present once near `mNodeRandomizationSeed`.
- `mResourceClassOverride`: present 594 times.
- `mPurityOverride`: present 577 times.

Resolved resource-class override counts:

| Resource | Count |
| --- | ---: |
| `Desc_Coal_C` | 62 |
| `Desc_LiquidOil_C` | 53 |
| `Desc_NitrogenGas_C` | 50 |
| `Desc_OreBauxite_C` | 17 |
| `Desc_OreCopper_C` | 55 |
| `Desc_OreGold_C` | 17 |
| `Desc_OreIron_C` | 127 |
| `Desc_OreUranium_C` | 5 |
| `Desc_RawQuartz_C` | 17 |
| `Desc_SAM_C` | 19 |
| `Desc_Stone_C` | 94 |
| `Desc_Sulfur_C` | 16 |
| `Desc_Water_C` | 62 |

Resolved explicit purity-override counts:

| Purity | Count |
| --- | ---: |
| `RP_Inpure` | 191 |
| `RP_Normal` | 188 |
| `RP_Pure` | 198 |

Interpretation:

- The randomized save appears to serialize the seed/settings in the GameState object.
- The randomized save also serializes resolved per-node resource overrides.
- This means a future `saveFileProvider` can likely compute randomized map resource totals without knowing the seed algorithm.
- Seed-only support still requires independently deriving the algorithm behind `mNodeRandomizationSeed` + `mNodeRandomization` + `mNodePuritySettings`.
- The resource override count and explicit purity override count differ by 17 entries. A real parser should parse object boundaries and combine missing `mPurityOverride` values with the static base-node catalog's default purity, rather than relying on nearby-string pairing.

## Preferred Future Path

1. Research whether Satisfactory 1.2 randomized resource nodes are deterministically derivable from a seed and static world data.
2. If yes, implement an independent `randomSeedProvider` that takes only seed/settings and returns node counts/purities/resource caps.
3. If seed derivation is not practical, implement an optional `saveFileProvider` that reads a user-uploaded `.sav` locally in the browser and extracts resolved resource node data.
4. Keep uploaded saves local-only by default. Do not send save files to a server unless a future feature explicitly requires it and the UI says so.
5. Use tests with tiny synthetic save/resource fixtures before using real user saves.

## Research Plan

- Build a static base-node catalog with node IDs, coordinates, base resource type, and base purity.
- Create several new 1.2 Experimental saves with known seeds and randomization settings.
- For each seed/settings pair, use in-game observation or save-file inspection to record resolved node type and purity.
- First determine whether the GameState object exposes `mNodeRandomization`, `mNodePuritySettings`, and `mNodeRandomizationSeed` in real randomized saves.
- Then determine whether affected resource-node objects expose `mResourceClassOverride` and/or `mPurityOverride`.
- If those overrides exist, a save-file import can compute resource caps without knowing the seed algorithm.
- If only seed/settings exist, determine whether the seed algorithm can be independently reproduced.
- Determine whether each node's result is independently derived from seed + node ID, or whether the game shuffles resource/purity pools globally.
- Determine whether the randomizer preserves total node count and only changes type/purity distribution, or whether certain modes alter category pools in other ways.
- Implement the algorithm independently only after behavior is verified with fixture seeds.
- Keep tests that assert the default seed/settings match the base catalog.

## Randomized Save Test Matrix

Best next test save:

- Fresh 1.2 Experimental save.
- As early as possible after spawn.
- `Resource Node Randomization = Random`.
- `Resource Node Purity = Random`.
- Record the exact visible world seed.
- Session name like `BeltwiseSeedTest`.

Better isolated test pair:

1. `Resource Node Randomization = Random`, `Resource Node Purity = Default`.
2. `Resource Node Randomization = Default`, `Resource Node Purity = Random`.

The isolated pair helps determine whether type and purity use separate serialized properties or separate RNG passes.
