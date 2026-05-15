# Data Pipeline

Beltwise should not ship or load Satisfactory's raw `en-US.json` in the browser. The raw docs file is large and contains many classes the planner does not need.

Instead, Beltwise uses a build-time extractor:

```txt
Satisfactory en-US.json
        |
scripts/extract-satisfactory-data
        |
apps/web/public/data/satisfactory-current.json
        |
Angular app + planner packages
```

## Source File

Default local Steam path:

```txt
C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json
```

The extractor supports:

- `--input <path>`
- `--output <path>`
- `SATISFACTORY_DOCS_PATH`
- `SATISFACTORY_GAME_VERSION`

## Generate Data

```powershell
npm.cmd run data:extract -- --input "C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json" --output apps\web\public\data\satisfactory-current.json
```

## Generated Dataset Goals

The generated JSON should be:

- compact enough to load in the SPA
- stable-sorted for clean diffs
- schema-validated
- readable enough for debugging
- versioned or fingerprinted enough to detect stale data

The app should treat the generated dataset as read-only application data.
The generated source metadata includes the docs file name, optional modified timestamp, and source fingerprint.

## Include

- planner-relevant items
- raw resource descriptors
- automated production recipes
- base and alternate recipe classification
- ingredients and products with item IDs and amounts
- manufacturing duration
- produced-in machine IDs
- production machine metadata
- machine display names
- power metadata where available
- extractor/resource metadata where useful

## Exclude Or Defer

- decorative buildables
- foundations, walls, signs, lights, beams, and architecture parts
- vehicles and logistics buildings unless needed later
- weapons, equipment, consumables, and hand-craft-only recipes unless needed for production planning
- raw UI-only fields
- save-file parsing
- randomized-node seed logic

## Parser Notes

Satisfactory docs use Unreal-style tuple strings for recipe ingredient/product data and object references. Parse those into structured data rather than relying on broad regex replacements.

Important recipe fields include:

- `ClassName`
- `mDisplayName`
- `mIngredients`
- `mProduct`
- `mManufactoringDuration`
- `mProducedIn`
- `mVariablePowerConsumptionConstant`
- `mVariablePowerConsumptionFactor`
- `mGameplayTags`

Normalize Unreal references into stable IDs such as:

```txt
Desc_IronPlate_C
Recipe_IronPlate_C
Build_ConstructorMk1_C
```

Keep enough original source references for debugging.

## Testing

Parser and extractor changes should include tests for:

- tuple parsing
- tiny docs fixtures
- known early-game recipes
- alternate recipe detection
- produced-in machine normalization
- stable JSON output
- exclusion of unrelated buildables
