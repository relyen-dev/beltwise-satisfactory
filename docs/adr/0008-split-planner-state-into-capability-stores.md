# 0008: Split Planner State Into Capability Stores

Status: Accepted

## Context

`PlannerStoreService` had become a broad facade for workspace lifecycle, active-plan configuration, graph interaction, defaults, transfer, selectors, persistence, and solver wiring. Many methods were thin pass-throughs to smaller slices. That made components easy to wire in the short term, but it hid ownership, encouraged unrelated changes in one service, and made tests concentrate around the facade instead of the behavior being changed.

## Decision

Keep `PlannerStoreService` as the planner runtime/composition service only. It coordinates persistence startup, dataset/workspace initialization, solver scheduling, workspace activation hooks, workbench focus hooks, and destroy-time graph flushing.

Feature consumers should inject the capability that owns their use case:

- `PlannerWorkspaceSlice` for sessions, active-session plan lists, plan lifecycle, and application of global defaults to new plans.
- `PlannerPlanConfigStore` for active-plan targets, inputs, recipe/machine/resource settings, objective settings, plan notes, and renderer-neutral display intent.
- `PlannerDefaultsStore` for global defaults that seed newly created plans.
- `PlannerGraphStore` for renderer-neutral graph state, selection, inspector state, build-state node flags/notes, layout locks, and node-position flushing.
- `PlannerPlanTransferService` and `PlannerPlanTransferCapability` for browser import/export/share orchestration and imported-project preparation.
- `PlannerSolverService`, `DatasetService`, and `PlannerWorkbenchSlice` for solve status, dataset loading, and workbench panel/focus state.

Do not add convenience command forwards back to `PlannerStoreService`. New tests should be colocated with, and written against, the owning capability interface. Runtime-store tests should focus on composition and lifecycle wiring.

## Consequences

- Components and services name their dependencies more honestly, which makes future feature work easier to review.
- Capability tests now live near the state they verify instead of piling onto one root-store spec.
- Shared pure selectors and intent mutations can still be reused, but Angular service interfaces stay separate when they mutate different concepts, such as active-plan config versus global defaults.
- The planner page may still inject the root runtime privately to ensure composition hooks are constructed, but templates and child components should not bind to `store.*` surfaces.
- Future session-scale features should add or extend focused capabilities rather than rebuilding a single planner facade.
