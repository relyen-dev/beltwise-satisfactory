# Beltwise Factory Planner

Beltwise is a local-first, Satisfactory-inspired factory planner. It is unofficial and not affiliated with Coffee Stain Studios.

The app is built around a graph-first Angular planner, a compact generated Satisfactory dataset, a HiGHS-backed production solver, and local browser persistence. The repo keeps planner data, solver logic, saved project state, and graph rendering boundaries separate so the Angular UI stays mostly view/control glue.

The registered base domain is `beltwise.app`. The Satisfactory planner is intended to deploy at `satisfactory.beltwise.app` when it is ready.

## Current App

- Multi-project local planner with create, rename, duplicate, delete, and switch controls.
- Game-session plan grouping with active-session plan switching.
- User-configurable defaults for newly created plans.
- Multiple fixed or maximize production targets solved together.
- Objective presets plus custom weights and raw-resource route multipliers.
- Recipe search plus base/alternate enable controls.
- External item inputs for materials supplied by another factory.
- Raw resource caps and machine enable/disable controls.
- HiGHS-backed continuous LP solver with lexicographic objective stages.
- Interactive Foblex Flow production graph with draggable nodes and preserved layout.
- Resource, external input, recipe, output, and byproduct graph nodes.
- Restrained item and machine icons in planner controls, graph nodes, and inspector summaries.
- Graph display settings for belt/pipe tiers, rate precision, edge style, transport labels, and flow animation.
- Local build tracking through plan/node locks, node done state, and node notes.
- Plan JSON import/export plus compact `bw.p` share links/codes.
- Versioned `localStorage` persistence of user intent, not authoritative solver output.

## How It Fits Together

The core flow is:

```txt
Satisfactory en-US.json
  -> scripts/extract-satisfactory-data
  -> compact GameDataset JSON
  -> DatasetService + focused planner state capabilities
  -> packages/solver
  -> packages/planner-core graph model
  -> apps/web graph feature + Foblex Flow adapter/component
```

The Angular app is intentionally thin around domain work. `PlannerStoreService` is now runtime composition glue: it starts persistence and connects dataset, workspace, solver, graph, and workbench lifecycle hooks. Feature UI depends on focused capabilities such as `PlannerWorkspaceSlice`, `PlannerPlanConfigStore`, `PlannerDefaultsStore`, `PlannerGraphStore`, `PlannerPlanTransferService`, `DatasetService`, and `PlannerSolverService`. The parser, project model, solver model, graph conversion, transfer codecs, and renderer adapter are kept in smaller modules so they can be tested without driving the UI.

Good starting points:

- [docs/architecture.md](./docs/architecture.md) for package boundaries.
- [docs/product-spec.md](./docs/product-spec.md) for product direction and roadmap.
- [packages/planner-core/src/plan.ts](./packages/planner-core/src/plan.ts) for saved project shape.
- [apps/web/src/features/planner/planner-page.component.ts](./apps/web/src/features/planner/planner-page.component.ts) for the planner route entry point.
- [apps/web/src/features/planner/state/planner-store.service.ts](./apps/web/src/features/planner/state/planner-store.service.ts) for runtime composition.
- [apps/web/src/features/planner/state/planner-store.workspace.ts](./apps/web/src/features/planner/state/planner-store.workspace.ts) for session and plan lifecycle.
- [apps/web/src/features/planner/state/planner-plan-config.store.ts](./apps/web/src/features/planner/state/planner-plan-config.store.ts) for active-plan configuration.
- [apps/web/src/features/planner/state/planner-defaults.store.ts](./apps/web/src/features/planner/state/planner-defaults.store.ts) for global new-plan defaults.
- [apps/web/src/features/planner/state/planner-graph.store.ts](./apps/web/src/features/planner/state/planner-graph.store.ts) for renderer-neutral graph interaction state.
- [apps/web/src/features/planner/transfer/planner-plan-transfer.service.ts](./apps/web/src/features/planner/transfer/planner-plan-transfer.service.ts) for browser import/export/share orchestration.
- [packages/solver/src/lpModel.ts](./packages/solver/src/lpModel.ts) and [packages/solver/src/highsAdapter.ts](./packages/solver/src/highsAdapter.ts) for solving.
- [packages/game-data/src/parseDocs.ts](./packages/game-data/src/parseDocs.ts) for data extraction.
- [apps/web/src/features/graph/adapters/foblex-flow.adapter.ts](./apps/web/src/features/graph/adapters/foblex-flow.adapter.ts) for renderer-specific graph mapping.

## Quick Start

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

The dev app runs at `http://127.0.0.1:4200`.

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` if that happens.

## Workspace Layout

```txt
apps/web                         Angular standalone app
packages/game-data               Zod schemas, Unreal tuple parser, docs normalizer
packages/planner-core            Project state, resource limits, graph domain/display models
packages/solver                  Pure LP model builder, HiGHS adapter, solver mapping
scripts/extract-satisfactory-data Build-time en-US.json extractor CLI
apps/web/public/data             Compact planner dataset consumed by the app
data/generated                   Generated-data fallback served by the app
data/resource-limits             Fixture baseline resource caps
docs                             Architecture and data notes
```

Planner feature code is intentionally grouped by local responsibility:

```txt
apps/web/src/features/planner
  planner-page.component.*       Route entry point and page orchestration
  state                          Runtime store, capability stores, selectors, mutations
  workbench                      Planner panels, sections, inspectors
  solving                        Solve input, scheduler, solver service integration
  transfer                       Plan JSON and compact share import/export orchestration
  persistence                    Local workspace persistence coordination
  shared-ui                      Planner-local UI primitives and formatting helpers
```

## Project Docs

- [docs/product-spec.md](./docs/product-spec.md) captures the product direction and MVP scope.
- [docs/architecture.md](./docs/architecture.md) summarizes package ownership and data flow.
- [docs/data-model.md](./docs/data-model.md) describes generated data and persisted project data.
- [docs/development.md](./docs/development.md) covers local commands and day-to-day workflow.
- [docs/data-pipeline.md](./docs/data-pipeline.md) explains raw docs extraction.
- [docs/adr](./docs/adr) contains accepted architecture decisions.
- [docs/rfc](./docs/rfc) contains future ideas and research parking lots.

## Testing

```powershell
npm.cmd test
npm.cmd run test:web
npm.cmd run typecheck
```

Vitest covers the tuple parser, docs normalization, LP model builder, HiGHS adapter, production solver behavior, persistence hydration, transfer codecs, graph conversion, planner capability stores, selectors, and focused web app tests. `npm.cmd run test:web` runs just the web app Vitest coverage. The Angular app is also checked by `npm.cmd run build`.

## Data Extraction

The browser app loads `apps/web/public/data/satisfactory-current.json`. It does not load the raw Satisfactory docs file.

```powershell
npm.cmd run data:extract -- --input "C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json" --output apps\web\public\data\satisfactory-current.json
```

You can also set `SATISFACTORY_DOCS_PATH` and omit `--input`. Set `SATISFACTORY_GAME_VERSION` to label the generated dataset.

## Theme Tokens

Core visual values live in [tokens.css](./apps/web/src/styles/tokens.css). Change colors, spacing, radii, and font stacks there first. Component CSS should reference those custom properties rather than introducing one-off colors.

## Solver Status

The LP model builder and production solver are implemented and tested in `packages/solver`. `HighsProductionSolverAdapter` uses the HiGHS JavaScript/WASM runtime behind the solver adapter interface.

Beltwise patches the loaded `highs` wrapper to parse raw HiGHS solution output instead of truncated pretty output. This preserves planner rates well enough for four-decimal display values. See [ADR 0007](./docs/adr/0007-read-raw-highs-solution-output.md).

## Local Persistence

Workspaces are stored in `localStorage` under a versioned schema. Beltwise persists user intent only: sessions, projects/plans, user defaults, targets, recipe/machine/resource/input overrides, objective profile, graph display settings, plan notes, build state, and manual graph positions. Solver output is recalculated on load.

## Future Direction

Near-term work lives in [docs/product-spec.md](./docs/product-spec.md) and [docs/rfc/planner-next-roadmap.md](./docs/rfc/planner-next-roadmap.md). Current candidates are a workspace dashboard/navigation entry point, browser smoke tests, responsive polish, graph connection controls, linked-plan contract design, and continued graph layout evaluation. Save-file import, randomized node seeds, session-scale logistics, map planning, and assistant/tooling integrations remain future/RFC work unless explicitly pulled forward.
