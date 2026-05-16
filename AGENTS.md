# AGENTS.md

## Project

Beltwise is a local-first Angular factory planner for Satisfactory. Existing planner tools are useful prior art, but Beltwise must have its own code, visual design, data pipeline, assets, and solver implementation.

The app should stay unofficial and clearly separate from Coffee Stain/FICSIT branding.

## Current Priorities

- Keep the Angular app readable and approachable.
- Keep domain logic out of Angular components.
- Generate compact planner data from Satisfactory `en-US.json`; do not load the raw game docs in the browser.
- Store user plans locally.
- Support multiple output targets per plan.
- Keep graph rendering behind an adapter so Foblex Flow can be swapped later.
- Treat save-file import, randomized node seeds, share links, and assistant/tooling integrations as future work unless explicitly requested.

## Tech Stack

- Angular with standalone components.
- TypeScript with strict typing.
- npm workspaces.
- `packages/game-data` for parsing and normalized schemas.
- `packages/planner-core` for plan, resource, and renderer-neutral graph domain models.
- `packages/solver` for solver model and adapters.
- Foblex Flow for graph rendering, isolated to the graph feature layer.
- Vitest for package tests.

## Coding Rules

- Prefer small pure functions with typed inputs and outputs.
- Keep solver, parser, graph conversion, and persistence logic out of Angular templates and components where practical.
- Do not use unchecked `any`.
- Name units in fields, such as `amountPerMinute`, `durationSeconds`, and `powerMw`.
- Do not persist solver output as authoritative state; persist user intent/config and re-solve on load.
- Keep renderer-specific types out of `planner-core`, solver code, persistence, and exported plan formats.
- Keep generated data behind schemas.
- Add tests for parser and solver behavior when changing those areas.
- Avoid broad rewrites when a focused change will do.

## Branch Strategy

- Prefer intent-based branch prefixes over actor/tool prefixes. Use `feature/`, `refactor/`, `bugfix/`, `docs/`, `chore/`, or `test/` rather than `codex/`.
- Use `feature/` for user-visible capabilities or product behavior, such as `feature/graph-output-target-edit`.
- Use `refactor/` for structure-only changes with no intended behavior change.
- Use `bugfix/` for defect fixes, regressions, and incorrect behavior.
- Use `docs/` for documentation-only changes.
- Use `chore/` for repository maintenance, dependency updates, build tooling, and cleanup that should not affect runtime behavior.
- Use `test/` for test-only coverage improvements.
- Keep branch names lowercase, hyphenated, and scoped to one purpose. Rename the branch if the work's primary intent changes.
- Branch from an up-to-date `main` when practical, and avoid mixing unrelated feature, refactor, and cleanup work in one branch.

## UX Direction

- The graph canvas is the main planning surface.
- Workbench panels are first-class when active, but should feel like tools rather than blocking modals.
- Use dark graphite surfaces with Beltwise amber as the main accent.
- Keep dense planner controls readable and keyboard usable.
- Avoid closely mirroring any existing planner's exact layout, colors, row treatment, node styling, or navigation chrome.
- Text must not overflow buttons, graph nodes, rows, or workbench panels.

## Useful Commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

The dev app runs at `http://127.0.0.1:4200`.

## Sandbox Notes

- If `npm.cmd test` or a focused Vitest run fails while loading `vitest.config.mjs` with an `Access is denied` read error, treat it as a sandbox limitation first. Rerun the same command with appropriate permissions instead of changing test config.
- Git staging and commits may need escalated permissions because they write to `.git`. Request approval for `git add` and `git commit` rather than using filesystem workarounds.

Data extraction:

```powershell
npm.cmd run extract:data -- --input "C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json" --output data\generated\satisfactory-current.json
```

## Docs Map

- `docs/product-spec.md` is the product/spec north star.
- `docs/architecture.md` explains current package boundaries.
- `docs/data-model.md` explains the compact dataset and persisted project shape.
- `docs/development.md` is the local run/test/data workflow.
- `docs/data-pipeline.md` explains raw docs extraction.
- `docs/adr/` contains accepted architecture decisions.
- `docs/rfc/` contains future work and research parking lots.
