# RFC: Plugin-Shaped Extension Seams

Status: Future architecture guidance

## Summary

Beltwise may eventually support optional extensions, but the first step should be plugin-shaped seams inside the codebase rather than a public runtime plugin system.

The goal is to let future features ask, "Should this be a built-in capability, or should it be an extension point?" without committing the app to loading arbitrary third-party JavaScript in users' browsers.

The recommended path is:

1. Add internal registries only when a real feature needs variation.
2. Keep the first extension seams first-party and bundled with the app.
3. Let official extensions become separately owned packages later, still reviewed and bundled at build time.
4. Treat runtime third-party plugins as a separate security project, not the default path.

## Motivation

Beltwise can grow in many directions: reports, graph overlays, layout algorithms, export formats, objective presets, data packs, workbench tools, linked plans, and assistant/tooling integrations. Accepting every one of those as a built-in feature would make the core planner harder to navigate and harder to test.

At the same time, a browser plugin system has real risk. A plugin running as first-party JavaScript can read local planner data, call browser APIs, mutate the UI, and affect local persistence. That is not a small feature; it is a trust and isolation model.

This RFC keeps the extension idea alive while biasing toward safe, reviewable seams.

## Design Principles

- Prefer plugin-shaped seams over speculative plugin platforms.
- Start with first-party modules registered by the app.
- Keep extension interfaces narrow and host-owned.
- Do not pass `PlannerStoreService` or other broad mutable services directly to extensions.
- Give extensions snapshots and declared intents instead of internal state mutation privileges.
- Validate extension inputs and outputs with schemas when they cross persistence, import/export, solver, or browser boundaries.
- Keep renderer-specific extension points out of `planner-core`.
- Keep official extensions reviewable and bundled before considering dynamic loading.
- Treat user-installed runtime JavaScript as untrusted unless it is isolated.

## Extension Maturity Path

### Phase 1: Internal Registries

Add a local registry when a concrete feature needs multiple implementations.

Examples:

- report generators
- graph overlays
- export formats
- layout strategies
- objective preset providers
- workbench tools

These registries should live near the feature that owns the behavior. They are not public APIs yet.

### Phase 2: Bundled Official Extensions

If an extension grows large enough, move it to a package or feature-local module that still ships with the app.

Example shape:

```txt
packages/
  report-awesome-sink/
  graph-overlay-resource-pressure/
apps/web/src/features/planner/extension-registry.ts
```

The app imports approved extensions at build time. Users may enable or disable them in settings, but the code is still reviewed and shipped by the Beltwise app.

### Phase 3: Local Clone Extensions

Power users running their own clone could maintain a local registry file and build their own app.

Example:

```ts
export const localExtensions = [myCustomReportExtension, myExperimentalOverlay];
```

This is not the same as an officially supported marketplace. Users who build their own app are responsible for trusting the code they add.

### Phase 4: Runtime Plugins

Loading plugins dynamically from URLs, npm packages, or uploaded bundles should be considered only after the extension model is proven.

If Beltwise ever supports runtime plugins, use isolation:

- sandboxed iframes for plugin UI
- message passing instead of direct service access
- schema-validated messages
- explicit user consent for plan/project access
- clear trust labeling for official, community, and local plugins
- no direct access to local persistence by default

This phase should get its own ADR before implementation.

## Candidate Extension Seams

### Reports And Exports

Risk: low.

Report plugins can read a project snapshot, dataset metadata, and solve result, then produce markdown, CSV, JSON, or another export artifact.

This is the safest first seam because it can be read-only and easy to test.

### Graph Overlays

Risk: medium.

Graph overlay plugins can add annotations such as bottlenecks, throughput warnings, resource pressure, power pressure, or plan-completion highlights.

They should consume renderer-neutral graph data where possible and return overlay descriptors. Foblex-specific rendering should stay in the graph feature layer.

### Layout Strategies

Risk: medium.

Layout plugins can propose node positions from renderer-neutral graph data. They should not own persisted graph state; the host planner remains responsible for storing manual layout.

This aligns with the existing graph renderer seam.

### Objective Presets

Risk: medium to high.

Objective extensions can add named objective profiles or stage-order strategies. They must preserve solver correctness and should be tested through `packages/solver` and `packages/planner-core` contracts.

### Data Packs

Risk: medium.

Data-pack extensions should prefer schema-validated data over code. This could support alternate datasets, mods, or custom recipe sets without giving arbitrary code access to the planner.

Data packs must not bypass generated-data schemas.

### Workbench Tools

Risk: high.

Workbench tool plugins can add new planner panels or tools. These are powerful but can easily couple to app state. They should be delayed until the app has a narrow host interface for planner snapshots and command intents.

## Host Interface Shape

Extensions should receive narrow context objects owned by the host.

Example shape:

```ts
interface PlannerExtensionContext {
  readonly project: PlannerProject;
  readonly dataset: GameDataset;
  readonly solveResult: ProductionPlanResult | null;
  dispatch(intent: PlannerIntent): void;
}
```

The exact types should come later. The important rule is that an extension receives snapshots and a constrained dispatch interface, not direct access to broad Angular services or mutable planner internals.

## When To Consider A Plugin Seam

Consider a plugin-shaped seam when a feature:

- has several plausible implementations
- is optional or user-selectable
- can be described by a small host-owned interface
- reads planner state more often than it mutates it
- can be tested without driving the full UI
- would otherwise make the core planner carry niche behavior

Prefer a built-in feature when:

- the behavior is central to every user workflow
- it changes persisted project shape or solver semantics
- it requires tight coordination across many existing modules
- the interface would be nearly as complex as the implementation

## Non-Goals

- Do not build a marketplace now.
- Do not load arbitrary JavaScript from user-provided URLs now.
- Do not let extensions mutate `PlannerStoreService` directly.
- Do not use plugins to avoid designing core project, solver, or graph models.
- Do not promise stable public extension APIs until at least one first-party seam has proven useful.

## Open Questions

- Which seam should be first: reports/exports, graph overlays, or layout strategies?
- Should official extensions live in `packages/*`, `apps/web/src/features/*`, or a separate repository later?
- How should user enablement settings be persisted if bundled extensions become user-toggleable?
- What schema library should validate extension manifests and messages if runtime plugins are ever explored?
- Would data packs need a separate package boundary from code extensions?

## Current Recommendation

Do not build a public plugin system yet.

As expanded features are designed, look for plugin-shaped seams and introduce small first-party registries only when the variation is real. Favor read-only reports/exports or graph overlays as the first experiment. Record any decision to support runtime third-party plugins as a dedicated ADR before implementation.
