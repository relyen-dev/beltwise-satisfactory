# Beltwise Project Spec

Beltwise is the working product name.

Beltwise is a Satisfactory-inspired production planner, not a clone of any existing planner. Existing planners are useful prior art for interaction patterns, but the code, data pipeline, solver model, visual design, and product direction should be our own.

## Product Direction

Build a readable, local-first factory planner that can:

- Parse Satisfactory game docs into a clean internal dataset.
- Let users request product rates, resource limits, enabled recipes, alternate recipes, and allowed machines.
- Solve production plans with linear optimization.
- Explain what a plan requires through graph flows, machine counts, power totals, raw inputs, and warnings.
- Render an interactive production graph with draggable nodes and preserved layout.
- Start with static baseline map resource limits, while leaving room for save-file imports and randomized node seeds later.

## Current Implementation Baseline

The current app is a working local-first Angular planner:

- `apps/web` is an Angular standalone app with a graph-first planner screen and workbench sections for Plan, Recipes, Inputs, Resources, Machines, and Display.
- `packages/game-data` parses Satisfactory `en-US.json`, normalizes it behind Zod schemas, and emits stable compact JSON for the browser.
- `packages/planner-core` owns persisted project state, resource-cap contracts, renderer-neutral graph models, graph display settings, and graph layout preservation.
- `packages/solver` owns the continuous LP model, lexicographic solve flow, HiGHS adapter, and solution-to-plan mapping.
- The browser loads compact generated data from `apps/web/public/data/satisfactory-current.json`, with `data/generated/satisfactory-current.json` available as a built-asset fallback.
- The production solver is HiGHS-backed through the `highs` JavaScript/WASM runtime, with the wrapper patched to read raw solution values instead of truncated pretty output.
- Projects are saved in `localStorage` under a versioned schema and store user intent/configuration, not authoritative solver output.
- Foblex Flow renders the graph through an app-layer adapter. Default graph positions are currently generated with Dagre inside the renderer-neutral graph model path.
- The current graph supports resource, external input, recipe, output, and byproduct nodes, plus selected-path focus, manual node movement, node done state, node notes, transport labels, and configurable edge style.

Future plans in this document should be read as forward direction only when they are marked as future or not represented in the current source tree.

## Naming And Domain Strategy

Use `Beltwise` as the product name.

Use `beltwise.app` as the canonical base domain. It has been registered through Cloudflare Registrar, with Cloudflare DNS expected for public records.

Deployment target for the Satisfactory planner:

- `satisfactory.beltwise.app`

Avoid putting game trademarks in the primary registered domain. A subdomain or route is easier to change if community guidelines or branding needs shift later.

## Hosting Strategy

Use Azure Static Web Apps for the first public deployment.

Initial hosting direction:

- Create a `beltwise-dev` resource group.
- Start with Azure Static Web Apps Free.
- Use Cloudflare DNS for `beltwise.app`.
- Point a minimal root page at `beltwise.app` before the Satisfactory planner is public.
- Deploy the Satisfactory planner at `satisfactory.beltwise.app` when ready.
- Deploy the Angular app from GitHub or Azure DevOps.

The owner has a Visual Studio Professional benefit with a `$50` monthly Azure dev/test credit. Treat this as a development sandbox, not production funding. The SPA should fit in Azure Static Web Apps Free unless we add paid services such as Functions, storage, App Insights, or a server-side solver.

## MVP Scope

The first version should handle a useful early-to-mid-game slice:

- Items, raw resources, recipes, and manufacturing machines from `en-US.json`.
- Multiple output targets in one plan, such as `25 Iron Plate/min`, `20 Iron Rod/min`, and `60 Wire/min`.
- Fixed output targets such as `60 Iron Plate/min`.
- Optional maximize targets such as `maximize Screws`.
- Recipe enable/disable controls.
- Alternate recipe controls.
- Raw resource availability controls.
- External item inputs for materials supplied by another factory.
- Continuous LP solving.
- Machine counts as fractional/rounded display, not integer solver constraints.
- Angular-based interactive graph with resource, external input, recipe, output, and byproduct nodes.
- Local browser persistence for multiple user projects/plans, manual node positions, graph display settings, and build-tracking notes.

Do not include save-file parsing, seed-based randomized resource detection, train/logistics planning, blueprint generation, multiplayer sharing, or account/server features in the MVP. Nuclear and late-game recipes may be present in generated data and solver regression tests, but specialized nuclear UX remains future work.

## Non-Functional Requirements

- The app should work offline after initial load when using bundled/generated data.
- Core planning should run client-side.
- No analytics or telemetry in the MVP.
- Plan/project data should live in local storage or IndexedDB with a versioned schema.
- User plans should be local-only in the MVP. Do not store user plans on a server.
- Persist user intent/configuration, not full optimized solver output.
- Import/export should use explicit JSON files or compressed share strings later.
- The app should show clear infeasible/error states rather than silently failing.
- The UI should remain responsive during solving and layout work. Add Web Workers if real-world solve or layout time starts blocking interaction.
- Generated data should include a source fingerprint or hash so stale data is obvious.
- Public pages should have a simple privacy posture: no account required, no personal data collected in MVP.

## Current Tech Stack And Direction

Use:

- TypeScript with `strict` enabled.
- npm workspaces.
- Angular CLI + Angular standalone components for the web app.
- Foblex Flow (`@foblex/flow`) for Angular-native interactive graph rendering.
- Dagre (`@dagrejs/dagre`) for the current automatic left-to-right default graph layout.
- HiGHS via the `highs` JavaScript/WASM package for LP solving, isolated behind solver adapters.
- Zod for generated-data validation and import/export validation.
- Angular services with signals/computed state for planner UI state; use RxJS where streams are naturally useful.
- Angular component-scoped CSS or SCSS with shared CSS custom properties. Avoid a heavy CSS framework at first; readable code matters more.
- Vitest for framework-independent packages and focused Angular-adjacent pure/service tests.
- Angular production/development builds as the current app smoke check.
- ESLint + Prettier, with no unchecked `any`.

Use npm workspaces unless there is a strong reason to switch. Keep the repo easy for new contributors and maintainers to navigate.

Future technical options:

- Web Workers for solver and graph layout work if profiling shows visible UI stalls.
- Playwright smoke tests for browser-level graph and planner workflows.
- ELK or another layout engine if Dagre no longer produces good factory graphs.
- The graph renderer is a replaceable UI implementation detail. Foblex Flow is the first recommended renderer, but React Flow, Cytoscape, or another renderer can be evaluated later. Keep graph domain models and layout data independent of renderer-specific types.

## Visual And Styling Direction

Beltwise should feel adjacent to Satisfactory without copying existing planner tools or pretending to be an official Coffee Stain/FICSIT interface.

Core design idea:

- A dense industrial planning cockpit.
- Clear production math first, decoration second.
- Dark graph canvas with high-contrast flow lines.
- Compact controls that feel like tools, not marketing cards.
- A little construction-site energy: amber, steel, signal colors, measured grids, bevel-like panel borders, and belt/flow motifs.

Do not copy:

- Any existing planner's exact header/nav structure.
- Any existing planner's exact background palette.
- Its node shapes, node colors, typography, spacing, or tab arrangement.
- Satisfactory/FICSIT logos or official branding as app branding.

Suggested visual language:

- Background: near-black graphite or carbon, not pure navy.
- Panels: layered graphite/steel surfaces with subtle borders.
- Primary accent: Beltwise amber, used sparingly for active controls and selected paths.
- Secondary accents: resource green, machine blue, warning red, power violet, neutral limestone gray.
- Canvas: faint grid or blueprint-dot texture using CSS only.
- Graph edges: color by flow role or item family, with selected flow highlighted.
- Nodes: compact rectangular modules with clear type differences.
- Typography: modern readable sans-serif for UI; optional condensed/technical display face only for logo/brand text.
- Corners: small radii, typically `4px` to `8px`.
- Motion: quick functional transitions only; avoid bouncy or decorative animation.

Graph readability:

- Graph node text must remain legible at the normal "whole factory plan" zoom level.
- Use a highly readable UI font for graph nodes, such as `Inter`, `Atkinson Hyperlegible`, `Segoe UI`, or system sans-serif.
- Avoid ultra-small graph text. Prefer `12px` to `14px` node labels with strong contrast and medium/semibold weight.
- Keep graph node content terse: item/recipe name, amount per minute, machine name, and machine count.
- Use stable node dimensions so labels, hover states, and selected states do not resize the graph layout.
- Avoid oversized nodes, but do not compress labels until they become hard to scan.
- Recipe nodes must show the production machine, for example `4x Constructor`, `3x Smelter`, or `1.5x Assembler`.
- If the exact machine count is fractional, display a rounded readable value while preserving exact values in the inspector.
- Edge labels should be short and high contrast: `Iron Ingot 120/min`, not verbose sentences.

Initial CSS structure:

```txt
apps/web/src/styles/
  tokens.css
  global.css
  layout.css
  foblex-flow-theme.css
```

Use CSS custom properties for tokens:

```css
:root {
  --color-bg: #111416;
  --color-bg-canvas: #151b1f;
  --color-panel: #1f2529;
  --color-panel-raised: #252c31;
  --color-border: #3a444b;
  --color-text: #edf1f3;
  --color-text-muted: #9ba8b0;
  --color-accent: #f2a51a;
  --color-accent-strong: #ffbf3d;
  --color-resource: #53b86a;
  --color-machine: #4da3d9;
  --color-output: #78c267;
  --color-warning: #e05845;
  --color-power: #a678d6;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --font-ui: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

These token values are a starting point, not sacred. The important part is to centralize them and avoid one-off colors throughout components.

Accessibility and polish:

- Meet WCAG AA contrast for text and controls.
- Every icon-only button needs an accessible label and tooltip.
- Inputs must be usable by keyboard.
- Focus styles must be visible.
- Text must not overflow buttons, nodes, sidebars, or cards.
- The graph should still be understandable without item icons.
- Use semantic buttons/inputs rather than clickable divs.

Responsive direction:

- Desktop-first planner with sidebars and a large graph.
- On narrow screens, collapse sidebars into drawers/tabs.
- Do not try to make the graph tiny and fully equivalent on phone screens in MVP; keep it usable enough for inspecting plans and editing targets.

Brand treatment:

- Use the wordmark `Beltwise`.
- Keep any Satisfactory reference in a subtitle or footer: `An unofficial factory planner for Satisfactory`.
- Include a small disclaimer in the app footer/about panel: `Beltwise is unofficial and not affiliated with Coffee Stain Studios.`
- Do not use the Satisfactory logo as a primary page element.

## Current Repository Layout

```txt
beltwise-satisfactory/
  package.json
  angular.json
  tsconfig.base.json
  prettier.config.js
  apps/
    web/
      package.json
      public/
        data/satisfactory-current.json
      src/
        app/
          app.config.ts
          app.routes.ts
        features/planner/
        features/graph/
          adapters/
        styles/
  packages/
    game-data/
      src/
        schema.ts
        parseDocs.ts
        tupleParser.ts
        stableJson.ts
        fixtureDataset.ts
      test/
    planner-core/
      src/
        model.ts
        plan.ts
        resourceLimits.ts
        graphModel.ts
        graphRendererModel.ts
    solver/
      src/
        SolverAdapter.ts
        highsAdapter.ts
        lpModel.ts
        solveProductionPlan.ts
      test/
  scripts/
    extract-satisfactory-data/
      src/index.ts
  data/
    generated/
      satisfactory-current.json
    resource-limits/
      baseline-map.json
  docs/
    adr/
    rfc/
    architecture.md
    data-model.md
    data-pipeline.md
    development.md
```

Architecture decision records live in `docs/adr/`. They explain why major choices were made and should be updated with numbered prefixes such as `0006-...` for future decisions.

## Data Extraction

The `en-US.json` parser is a build-time/offline tool, not browser runtime code.

Do not ship the full `en-US.json` file to users. It is roughly 10 MB and contains many classes Beltwise does not need. Instead, run the extractor infrequently when Satisfactory updates or when we change the data model, then commit or publish the smaller generated dataset consumed by the web app.

Input:

```txt
C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json
```

The extractor should also accept:

- `--input <path>`
- `--output <path>`
- `SATISFACTORY_DOCS_PATH`

Expected output:

- `apps/web/public/data/satisfactory-current.json` for the app's primary runtime dataset.
- `data/generated/satisfactory-current.json` may exist as a generated-data fallback or comparison copy.
- A compact, readable, normalized JSON file.
- Only include data needed by the planner.
- Preserve enough source references for debugging, but do not carry every raw field through to the frontend.
- Include a dataset version/source fingerprint so stale generated data is obvious.
- Prefer stable sorted output for clean diffs.

MVP output should focus on:

- Items that appear in automated production recipes or raw extraction.
- Raw resources and resource descriptors.
- Recipes that can participate in automated production.
- Alternate recipes.
- Ore/fluid/gas extractors.
- Production machines: constructor, smelter, foundry, refinery, packager, assembler, manufacturer, blender, particle accelerator, converter, quantum encoder, and similar.
- Power-relevant machine metadata.
- Unlock/schematic metadata only where useful for grouping/filtering recipes.

MVP output should exclude or mark out of scope:

- Decorative buildables.
- Foundations, walls, signs, lights, beams, architecture parts.
- Equipment, weapons, ammo, consumables, and hand-craft-only recipes unless they are needed by production planning.
- Vehicles, trains, drones, and logistics buildings unless needed later for a logistics feature.
- Raw UI-only fields that do not affect planning.

The raw docs are grouped by Unreal native class, with each group containing a `Classes` array. Relevant groups include:

- `FGItemDescriptor`
- `FGResourceDescriptor`
- `FGRecipe`
- `FGBuildingDescriptor`
- `FGBuildableManufacturer`
- `FGBuildableManufacturerVariablePower`
- `FGBuildableResourceExtractor`
- `FGBuildableFrackingExtractor`
- `FGBuildableGeneratorFuel`
- `FGBuildableGeneratorNuclear`
- `FGBuildableWaterPump`
- `FGSchematic`

Important recipe fields:

- `ClassName`
- `mDisplayName`
- `mIngredients`
- `mProduct`
- `mManufactoringDuration`
- `mProducedIn`
- `mVariablePowerConsumptionConstant`
- `mVariablePowerConsumptionFactor`
- `mGameplayTags`

The tuple-like Unreal strings should be parsed into structured data with a small parser. Avoid depending on loose regex for the full format.

Normalize Unreal references into stable IDs:

```ts
type ItemId = string; // Example: "Desc_IronPlate_C"
type RecipeId = string; // Example: "Recipe_IronPlate_C"
type MachineId = string; // Example: "Build_ConstructorMk1_C"
```

Keep the original `ClassName` on normalized entities and a source fingerprint on the dataset for traceability. Do not carry bulky raw object payloads into the browser.

Frontend data loading:

- The Angular app should load the generated dataset, not the raw docs file.
- The app should be able to work with a tiny fixture dataset in tests and early development.
- The generated production dataset can be bundled as a static asset or dynamically fetched from the deployed app's assets directory.
- The planner should treat the dataset as read-only application data.

## Generated Data Model

```ts
interface GameDataset {
  id: string;
  game: 'satisfactory';
  gameVersionLabel: string;
  generatedAt: string;
  source: {
    docsFileName: string;
    docsLastModified?: string;
    fingerprint?: string;
  };
  items: Record<ItemId, Item>;
  recipes: Record<RecipeId, Recipe>;
  machines: Record<MachineId, Machine>;
  resources: Record<ItemId, ResourceInfo>;
  schematics: Record<string, Schematic>;
}

interface Item {
  id: ItemId;
  className: string;
  displayName: string;
  description?: string;
  form: 'solid' | 'liquid' | 'gas' | 'invalid' | 'unknown';
  stackSize?: string;
  energyValue?: number;
  sinkPoints?: number;
  iconRef?: string;
  category?: string;
}

interface Recipe {
  id: RecipeId;
  className: string;
  displayName: string;
  ingredients: IngredientAmount[];
  products: IngredientAmount[];
  durationSeconds: number;
  producedIn: MachineId[];
  isAlternate: boolean;
  isHandCraftOnly: boolean;
  tags: string[];
  unlocks?: string[];
  variablePower?: {
    constant: number;
    factor: number;
  };
}

interface IngredientAmount {
  itemId: ItemId;
  amount: number; // per recipe execution
}

interface Machine {
  id: MachineId;
  className: string;
  displayName: string;
  type:
    | 'manufacturer'
    | 'variablePowerManufacturer'
    | 'extractor'
    | 'resourceWellExtractor'
    | 'generator'
    | 'waterPump'
    | 'unknown';
  powerMw?: number;
  powerRangeMw?: {
    min: number;
    max: number;
  };
  manufacturingSpeed?: number;
  extraction?: MachineExtraction;
}

interface MachineExtraction {
  amountPerCycle?: number;
  cycleTimeSeconds?: number;
  amountPerMinute?: number;
  allowedResourceForms?: Array<'solid' | 'liquid' | 'gas' | 'invalid' | 'unknown'>;
  allowedResourceItemIds?: ItemId[];
  extractorTypeName?: string;
}

interface ResourceInfo {
  itemId: ItemId;
  displayName: string;
  extraction?: {
    allowedExtractors: MachineId[];
    baselineMaxPerMinute?: number;
    notes?: string;
  };
}
```

## Baseline Map Resource Limits

The current generated dataset stores static baseline caps on resource metadata as `resources[itemId].extraction.baselineMaxPerMinute`. `packages/planner-core` also supports an optional `BaselineResourceLimits` input so explicit baseline files or future providers can override generated caps without changing solver code.

The separate `data/resource-limits/baseline-map.json` file is useful as a fixture/reference shape:

```ts
interface BaselineResourceLimits {
  id: string;
  gameVersionLabel: string;
  assumptions: string[];
  limits: Record<ItemId, ResourceLimit>;
}

interface ResourceLimit {
  itemId: ItemId;
  maxPerMinute: number;
  source: 'manual-map-count';
  nodeCounts?: {
    impure?: number;
    normal?: number;
    pure?: number;
  };
  extractorAssumption?: {
    machineId: MachineId;
    clockPercent: number;
    beltOrPipeLimited: boolean;
  };
}
```

Do not hard-code map limits into solver code. The solver should only know that raw resources have upper bounds supplied by the generated dataset, project overrides, or a resource provider.

Future resource providers:

- Static global baseline.
- User custom resource caps.
- Region or biome presets.
- Save-file import.
- Randomized node seed import, if the algorithm or save data is available.

## Solver Model

Use continuous linear programming first.

Decision variables:

- `recipeRate[recipeId] >= 0`: recipe executions per minute.
- `rawInput[itemId] >= 0`: raw resource consumption per minute, bounded by resource limits.
- `externalInput[itemId] >= 0`: item flow supplied by another factory, bounded by user-entered availability.
- `maximizeTarget[targetId] >= 0`: solved output rate for maximize targets.
- `surplus[itemId] >= 0`: overproduction/byproduct flow for reporting and tie-breaking.

For each item:

```txt
sum(recipeRate[r] * productAmount[r,item])
- sum(recipeRate[r] * ingredientAmount[r,item])
+ rawInput[item]
+ externalInput[item]
- fixedRequestedOutput[item]
- maximizeTarget[item]
- surplus[item]
= 0
```

For a recipe with duration:

```txt
recipeExecutionsPerMinuteAt100Percent = 60 / durationSeconds
machineCount = recipeRate / recipeExecutionsPerMinuteAt100Percent / machineSpeed
```

Implemented lexicographic objective stages:

1. Satisfy fixed outputs through equality constraints.
2. For maximize targets, maximize requested output rates.
3. Minimize weighted raw resource usage.
4. Minimize surplus, except where surplus is unavoidable due to byproducts.
5. Minimize recipe activity/machine count.
6. Minimize power.

The HiGHS adapter solves these stages lexicographically, adding lock constraints between stages:

- First stage finds maximum output or feasibility.
- Later stages minimize costs while preserving earlier-stage values within solver tolerances.
- Raw-input profile locks keep later tie-breakers from adding tiny extra raw resource inputs.

Resource preference:

- Weight raw resources by scarcity, roughly `consumedPerMinute / baselineMaxPerMinute`.
- Allow manual preference multipliers in `ObjectiveProfile`, such as "prefer iron over copper" or "avoid oil".
- Objective profile editing remains future UI work; the data model and solver path already support it.

Important: keep the LP model builder pure and testable. The UI should never assemble LP strings directly.

## Planner State

```ts
interface PlannerProject {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  targets: ProductTarget[];
  recipeOverrides: Record<RecipeId, RecipeOverride>;
  machineOverrides: Record<MachineId, MachineOverride>;
  resourceOverrides: Record<ItemId, ResourceOverride>;
  itemInputs: Record<ItemId, ItemInputOverride>;
  objectiveProfile: ObjectiveProfile;
  graphLayout: GraphLayoutState;
  graphDisplay: GraphDisplaySettings;
  buildState: PlanBuildState;
}

interface PlannerSession {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  activeProjectId?: string;
}

interface StoredPlannerStateV3 {
  schemaVersion: 3;
  activeSessionId?: string;
  activeProjectId?: string;
  sessions: PlannerSession[];
  projects: PlannerProject[];
  userDefaults: PlannerUserDefaults;
}

interface PlannerUserDefaults {
  recipeOverrides: Record<RecipeId, RecipeOverride>;
  machineOverrides: Record<MachineId, MachineOverride>;
  resourceOverrides: Record<ItemId, ResourceOverride>;
  objectiveProfile: ObjectiveProfile;
  graphDisplay: GraphDisplaySettings;
}

interface ProductTarget {
  id: string;
  itemId: ItemId;
  mode: 'fixed' | 'maximize';
  amountPerMinute?: number;
  sortOrder: number;
}

interface RecipeOverride {
  enabled: boolean;
}

interface MachineOverride {
  enabled: boolean;
}

interface ResourceOverride {
  enabled?: boolean;
  maxPerMinute?: number;
}

interface ItemInputOverride {
  amountPerMinute: number;
}

interface ObjectiveProfile {
  resourceScarcityWeight: number;
  powerWeight: number;
  machineCountWeight: number;
  surplusWeight: number;
  rawResourceMultipliers: Record<ItemId, number>;
}

interface GraphDisplaySettings {
  maxBeltTier: 1 | 2 | 3 | 4 | 5 | 6;
  maxPipeTier: 1 | 2;
  rateDecimalPlaces: 1 | 2 | 3 | 4;
  edgeStyle: 'straight' | 'curved';
  showTransportLabels: boolean;
  animateFlowLines: boolean;
}

interface PlanBuildState {
  planLocked: boolean;
  nodeLayoutLocked: boolean;
  nodeStates: Record<string, GraphNodeBuildState>;
}

interface GraphNodeBuildState {
  done?: boolean;
  note?: string;
}
```

Persistence rules:

- Support multiple separate user plans/projects grouped under game sessions.
- Store project configuration locally under a versioned schema.
- Keep projects as standalone plan records; sessions reference project ids instead of embedding plans.
- Store global user defaults separately from projects and sessions.
- Store targets, recipe overrides, machine overrides, resource caps, item inputs, objective profile, graph display settings, plan/node locks, node done state, node notes, and manual graph layout.
- Do not persist full solver output, machine totals, or derived graph edges as authoritative state.
- On project load, rerun the solver from the stored configuration and generated dataset.
- If the solver is temporarily slow, cache the last result only as a non-authoritative convenience and invalidate it when inputs/dataset change.
- Plan import/export remains plan-level only and does not include whole-session state.
- See [`docs/data-model.md`](./data-model.md) for the current workspace migration and hydration rules.

## Graph Model

Keep solver output separate from graph output.

Graph domain data must stay renderer-agnostic. Do not store React Flow, Foblex Flow, Cytoscape, or vis-network objects in `planner-core`, solver packages, persistence, or share/export formats.

Solver result:

```ts
interface ProductionPlanResult {
  status: 'optimal' | 'infeasible' | 'unbounded' | 'error';
  recipeRates: Record<RecipeId, number>;
  rawInputs: Record<ItemId, number>;
  externalInputs?: Record<ItemId, number>;
  itemFlows: ItemFlow[];
  outputs: Record<ItemId, number>;
  surplus: Record<ItemId, number>;
  machineUsage: MachineUsage[];
  powerMw: number;
  warnings: PlanWarning[];
}
```

Graph result:

```ts
interface ProductionGraph {
  nodes: ProductionGraphNode[];
  edges: ProductionGraphEdge[];
}
```

Renderer boundary:

```ts
interface GraphRendererNode {
  id: string;
  kind: 'resource' | 'externalInput' | 'recipe' | 'output' | 'byproduct';
  position: { x: number; y: number };
  size?: { width: number; height: number };
  data: ProductionGraphNode;
}

interface GraphRendererEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  data: ProductionGraphEdge;
}
```

Each UI implementation should have a thin adapter such as:

- `toFoblexFlowModel(rendererModel, options)`
- `toReactFlowElements(graph, layoutState)`
- `toCytoscapeElements(graph, layoutState)`

Only the graph feature/component layer should import renderer-specific packages. If the renderer changes later, most production planning, solver, graph-building, persistence, and tests should remain untouched.

Node types:

- `resource`: raw resource source.
- `externalInput`: item source supplied by another factory.
- `recipe`: recipe/machine group.
- `output`: requested output sink.
- `byproduct`: surplus or waste sink.

Recipe graph nodes must include:

- Recipe display name.
- Machine display name.
- Machine count at the solved rate.
- Recipe rate or primary item throughput.

Output graph nodes must correspond to individual requested product targets. A plan can have one output target or many output targets.

Edge labels:

- Item display name.
- Flow per minute.
- Optional belt/pipe transport counts based on configured max belt and pipe tiers.

Layout rules:

- Dagre currently creates the initial left-to-right layout from renderer-neutral graph data.
- Foblex Flow should preserve dragged positions.
- Existing node positions should be reused after recalculation.
- New nodes should be auto-placed.
- Node IDs must be stable across solves when the logical node is the same.
- ELK remains a future option if Dagre layout quality is not enough for larger plans.

## UI MVP

The first screen should be the actual planner, not a marketing page.

Current primary layout:

- Top app bar: brand, project switcher/name, project actions, solve status, graph/layout locks, layout reset, inspector toggle.
- Left rail: Plan, Recipes, Inputs, Resources, Machines, Display, and Graph focus controls.
- Collapsible workbench panel: production targets and configuration sections.
- Center: interactive graph.
- Right inspector: selected node details, machine counts, item flows, power.
- Inspector panel: selected node state, node notes, plan status, power, machine usage, and warnings.

Production targets table:

- The planner must support multiple target rows in one plan.
- Each row has item selector, mode selector, amount input for fixed mode, duplicate action, and remove action.
- Fixed rows require an amount per minute.
- Maximize rows do not require an amount, but may later support priorities or weights.
- A single-target plan is just the simplest case of the same table, not a separate UI mode.
- Include an `Add product` action near the target list.
- Solving should use all target rows together, so shared intermediates and raw resources are optimized globally.
- Drag/reorder remains future work if row ordering becomes important beyond display ordering.

Configuration area:

- Recipes and alternate recipes should not dominate the default sidebar.
- Put recipe controls in a dedicated `Recipes` tab/drawer/accordion with search, base/alternate grouping, select all, select none, and per-recipe toggles.
- Put user-provided item inputs in an `Inputs` tab/drawer/accordion. These represent items produced elsewhere and available to this factory.
- Put map/resource caps in a `Resources` tab/drawer/accordion.
- Put allowed machines in a `Machines` tab/drawer/accordion.
- Put graph display controls in a `Display` tab/drawer/accordion.

Current controls:

- Add/remove target.
- Duplicate target.
- Toggle target mode between fixed and maximize.
- Numeric rate input.
- Recipe search and enable/disable.
- Base/alternate recipe grouping with enable-all/disable-all controls.
- External input add/remove/item/rate controls.
- Resource cap editor.
- Resource enable/disable, reset all, disable all, and enable all.
- Machine enable/disable.
- Graph display controls for max belt tier, max pipe tier, rate precision, edge style, transport labels, and flow animation.
- Reset manual node positions button.
- Lock/unlock plan edits and lock/unlock graph node movement.
- Select graph nodes, mark nodes done, and add node notes.
- Create, rename, duplicate, delete, and switch local projects/plans.
- Save/load plans from local storage.

Future controls:

- Objective preset/profile editor for raw resource multipliers and objective weights.
- JSON import/export and compressed share strings.
- Row drag/reorder if target ordering needs direct manipulation.
- Richer graph relayout controls if resetting all manual positions is not enough.

Design direction:

- Dense but calm planner UI.
- Avoid oversized hero sections.
- Use icons for obvious actions.
- Cards only for repeated items or inspector panels, not nested card-heavy layout.
- Keep visual style distinct from existing planner tools.

## Icon Strategy

The docs expose icon asset references such as `mSmallIcon`, but not necessarily ready-to-use PNG files.

MVP:

- Keep `iconRef` optional in generated data.
- Use readable text-first UI with item names and type/color treatments.
- Build the UI so icons are optional.

Later:

- Add an optional local asset extraction/import step.
- Support a folder like `public/game-icons/<ItemId>.png`.
- Add a generated icon manifest mapping item IDs to files.
- Do not block core planning work on icon extraction.

For public distribution, review Coffee Stain's current asset/community guidelines before bundling any extracted game assets.

## Save Files And Randomized Nodes Later

Beltwise should eventually support resource limits from static map data, user custom caps, randomized-node seeds, or uploaded save files. This is not part of the MVP.

Keep future resource-limit sources behind a `ResourceProvider` abstraction:

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

Detailed save-file and randomized-node research belongs in [docs/rfc/resource-providers.md](rfc/resource-providers.md). Do not implement save parsing or seed-based resource providers during the first app build.

## Testing Strategy

Current automated coverage uses Vitest across packages and focused app logic.

Parser tests:

- Parse fixture tuple strings.
- Parse a tiny docs fixture with one item, one machine, and one recipe.
- Extractor output excludes unrelated buildables and includes only planner-relevant entities.
- Generated dataset output is stable/sorted for clean diffs.
- Verify alternate recipe detection.
- Verify produced-in references normalize to machine IDs.

Solver tests:

- Iron ore to iron ingots.
- Iron plates from iron ingots.
- Multiple fixed outputs solved together, sharing intermediates and raw resources.
- A branching plan with rods, screws, and reinforced plates.
- Recipe disabled means solver uses the next available route or becomes infeasible.
- Machine disabled means solver uses another available route or becomes infeasible.
- External item inputs reduce required raw input.
- Resource caps constrain output.
- Maximize target produces expected optimum for a tiny fixture.
- Full generated data regression cases should protect late-game plans and numerical precision.

Graph tests:

- Solver result maps to stable graph node IDs.
- Renderer adapters are isolated from planner-core graph data.
- Zero-rate recipes are omitted.
- Existing layout positions are preserved.
- Recipe nodes include machine display name and machine count.
- Multiple output targets create multiple output nodes.
- External inputs create distinct source nodes.
- Foblex adapter derives belt/pipe transport labels, configured precision, and straight/curved edge behavior.

App/service tests:

- Local persistence rejects malformed storage safely and hydrates valid project configuration.
- Planner solve keys change only for solve-relevant inputs.
- Planner mutation helpers preserve target, resource, display, and build-state rules.
- Workbench selectors sort/filter visible rows without leaking domain work into templates.

Future browser smoke tests:

- App loads.
- User adds multiple target rows.
- Solver returns a result.
- Graph renders non-empty nodes and edges.
- Recipe graph nodes show machine names/counts.
- Dragging a node persists position after re-solve.
- User can create and switch between at least two local projects.
- Loading a saved project reruns the solver from stored targets/configuration.

## Coding Standards

- Keep domain logic in `packages/*`, not in Angular components.
- Keep renderer-specific graph library types out of `planner-core`, solver code, persistence, and exported plan formats.
- Angular components should be mostly view/control glue.
- Prefer standalone components and route-level feature organization.
- Prefer Angular signals/computed values for local and app state that is naturally synchronous.
- Use RxJS for asynchronous streams, worker messages, and external event sources where it improves clarity.
- Prefer small pure functions with typed inputs and outputs.
- Name units in field names: `amountPerMinute`, `durationSeconds`, `powerMw`.
- Avoid magic numbers. Put solver tolerances and objective weights in named constants.
- Do not use unchecked `any`.
- Keep generated data behind schemas.
- Keep comments sparse and useful.
- Every parser edge case should have a fixture.
- Every solver bug should become a minimal fixture test.
- Favor explicit interfaces over clever generic abstractions.
- Do not make the first version a server app unless the browser solver proves inadequate.

## Completed Baseline And Next Milestones

Completed baseline:

1. Scaffolded repo with Angular CLI, TypeScript, npm workspaces, formatting, and tests.
2. Added game-data schemas, stable JSON output, Unreal tuple parsing, and docs normalization.
3. Added extractor CLI, fixture dataset, and generated Satisfactory dataset assets.
4. Built planner-core data types, project hydration, resource caps, graph model conversion, graph display settings, and layout preservation.
5. Implemented LP model builder, HiGHS solver adapter, lexicographic solve flow, and solution-to-plan mapping.
6. Added parser, planner-core, solver, persistence, selector, mutation, and graph-adapter tests.
7. Built graph model conversion and Dagre-backed default left-to-right layout.
8. Built Angular planner screen with multi-row target table, workbench sections, graph, inspector, and project controls.
9. Added local-only persistence for multiple projects/plans, storing user configuration, graph display settings, build-state notes, and manual node positions rather than authoritative solver output.
10. Added docs explaining local workflow, architecture, data model, and data regeneration.

Near-term follow-up:

1. Add objective profile controls for raw resource multipliers and objective weights.
2. Add JSON import/export for local project transfer before any account or server storage.
3. Add browser smoke tests for graph rendering, planner editing, persistence reload, and infeasible/error states.
4. Profile full-data solves and larger graph layout; move solver/layout work to Web Workers only if the UI visibly stalls.
5. Improve responsive workbench behavior on narrow screens without trying to make the full graph experience equivalent to desktop.
6. Decide whether Dagre remains sufficient or whether ELK should replace it behind the existing renderer-neutral graph boundary.
7. Keep save-file import, randomized node seeds, share links, and assistant/tooling integrations in RFC/future-work space unless explicitly pulled forward.
