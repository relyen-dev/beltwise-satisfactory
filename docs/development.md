# Development

This repo is a local-first Angular/TypeScript workspace for Beltwise.

## Prerequisites

- Node.js compatible with the Angular version in `package.json`.
- npm.
- A local Satisfactory install only when regenerating game data from `en-US.json`.

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Common Commands

Install dependencies:

```powershell
npm.cmd install
```

Run all package tests:

```powershell
npm.cmd test
```

Run focused web app tests:

```powershell
npm.cmd run test:web
```

Run workspace typechecks:

```powershell
npm.cmd run typecheck
```

Build everything:

```powershell
npm.cmd run build
```

Start the Angular dev server:

```powershell
npm.cmd run dev
```

The dev app runs at:

```txt
http://127.0.0.1:4200
```

## Workspace Layout

```txt
apps/web                         Angular app
packages/game-data               generated data schemas, tuple parser, docs normalizer
packages/planner-core            project state, resource limits, graph domain/display models
packages/solver                  LP model builder, HiGHS adapter, solver mapping
scripts/extract-satisfactory-data build-time docs extractor CLI
apps/web/public/data             compact planner dataset consumed by the app
data/generated                   generated-data fallback served by the app
data/resource-limits             baseline resource caps
docs                             architecture, ADRs, RFCs, and product notes
```

## Development Rules

- Keep parser, solver, graph conversion, and persistence logic out of Angular components where practical.
- Keep renderer-specific Foblex types in `apps/web/src/features/graph`.
- Keep `planner-core` graph and project models renderer-neutral.
- Persist user configuration, not solver output.
- Add focused tests when changing parser, solver, resource-limit, or graph-model behavior.
- Run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build` before handing off meaningful changes.
- If a sandboxed run of `npm.cmd test` fails while loading `vitest.config.mjs` with `Access is denied`, rerun the same command with the appropriate permissions before changing test configuration.

## Solver WASM Asset

The production solver uses the `highs` npm package, which loads a HiGHS JavaScript/WASM runtime.
Angular copies `node_modules/highs/build/highs.js` and `node_modules/highs/build/highs.wasm` to `/assets/highs/` through `angular.json`.
The default `HighsLinearSolverAdapter` loads those browser assets at runtime; Node-based tests and package builds load the npm package source directly.

Beltwise patches the loaded HiGHS wrapper source before executing it so solver variables are parsed from HiGHS raw solution output rather than human-readable pretty output. The pretty output truncates values such as `10 / 3` to `3.33333`, which is enough to create visible planner artifacts at four display decimals. See `docs/adr/0007-read-raw-highs-solution-output.md`.

When changing solver behavior:

- Keep the LP model builder pure and framework-independent.
- Add focused fixture tests for every solver bug or numerical artifact.
- Keep regression coverage for late-game full-data plans with many alternates enabled.
- Prefer fixing solver or adapter precision at the source before adding display-only rounding.

## Data Regeneration

The browser app should consume compact generated data from `apps/web/public/data/satisfactory-current.json`.
If that file is missing during early development, the app falls back to fixture data.

Regenerate it from local game docs with:

```powershell
npm.cmd run data:extract -- --input "C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json" --output apps\web\public\data\satisfactory-current.json
```

See `docs/data-pipeline.md` for more detail.
