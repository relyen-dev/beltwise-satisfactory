# RFC: Planner Store Capability Refactor

Status: Implemented architecture note

## Summary

`PlannerStoreService` started as a broad root facade for workspace state, plan editing, graph interaction, defaults, transfer, view selectors, persistence, and solver wiring. The refactor split those surfaces into focused capability modules and left the root service as planner runtime/composition glue.

Use this RFC as the preservation map for future planner state work. The goal remains Depth and Locality: a component should depend on the capability that owns its use case, and adding a new root-store forward should be treated as a design smell unless it is genuinely runtime composition.

## Current Root Shape

`PlannerStoreService` now acts as planner runtime/composition glue. It connects:

- Workspace lifecycle: sessions, projects, active project, user defaults, persistence initialization.
- Dataset/persistence startup to workspace initialization.
- Active project changes to solver input scheduling.
- Workspace graph lifecycle hooks to graph state flushing, pending-layout clearing, and selection clearing.
- Workspace activation hooks to workbench panel/focus behavior.
- Destroy-time graph node-position flushing.

The root should stay out of feature command surfaces. UI consumers should depend on `PlannerWorkspaceSlice`, `PlannerGraphStore`, `PlannerPlanConfigStore`, `PlannerDefaultsStore`, `PlannerPlanTransferService`, `DatasetService`, `PlannerSolverService`, and `PlannerWorkbenchSlice` according to the use case they own.

## Completed Refactories And Guardrails

### Store Surface Map

Definition: Keep an explicit map from each planner consumer to the owning capability interface it should depend on.

Reason: Without the map, future changes can drift back into shallow facade methods. The map keeps ownership consumer-first and gives each change a review test: if the runtime root grows feature commands again, the owning capability boundary is probably being bypassed.

Fix: Keep this RFC and [ADR 0008](../adr/0008-split-planner-state-into-capability-stores.md) current before adding a new planner-state facade. Use the surface map below to choose the owning capability, then test through that capability rather than through the runtime root.

### Plan Config Capability

Definition: A capability Module for editing one active plan's persisted intent and display configuration: targets, external inputs, resource caps, recipe and machine availability, objective profile, plan notes, and renderer-neutral graph display settings.

Reason: Workbench sections formerly reached through the root store for command methods and broad view groups. That coupled dense UI panels to unrelated workspace, transfer, and graph lifecycle APIs.

Fix: Keep plan-config views and commands on `PlannerPlanConfigStore`. Keep plan-lock enforcement inside the capability or behind a small graph-state port. Add tests at this interface for lock behavior, target/input updates, bulk toggles, objective edits, raw-resource multipliers, and display settings.

### Graph Capability

Definition: A capability Module for renderer-neutral graph state and interaction: production graph read model, selected node, inspector view model, node done/note state, plan/layout locks, layout reset, debounced node position commits, and flush-before-navigation behavior.

Reason: Graph concerns span graph build state, shell host listeners, inspector components, and parent-to-`ProductionGraphComponent` bindings. Keeping this as one capability protects the graph Adapter Seam while making graph interactions independently testable.

Fix: Keep graph read models and commands on `PlannerGraphStore`, consumed by the planner page, inspector, selected-node inspector, and graph host bindings. Keep Foblex-specific types in `apps/web/src/features/graph` and `adapters/`. Test selection, notes, done state, lock behavior, layout reset, and position flushing through the capability interface.

### Defaults Capability

Definition: A capability Module for user default settings: default recipe/machine/resource/objective/display rows, search state, commands, `saveActivePlanAsDefaults`, and reset-to-built-ins.

Reason: Defaults mirror plan config concepts but mutate `PlannerUserDefaults`, not the active project. Mixing both surfaces through the root store made it easy to accidentally use plan commands in the defaults panel or vice versa.

Fix: Keep the defaults panel on the defaults-only `PlannerDefaultsStore` interface. Share pure selector and mutation helpers with plan config where useful, but keep the Angular capability boundary separate. Tests should assert default mutations, save-from-active-plan, reset behavior, objective route multipliers, and dataset-baseline resource caps.

### Transfer Capability

Definition: A capability Module for plan JSON export/import and compact share payload export/import, including browser Adapters for download, clipboard, and hash location.

Reason: `PlannerPlanTransferService` formerly depended on `PlannerStoreService`, which hid the real ports it needed: dataset, active project, active session projects, graph flush, and project import. Transfer already had a deeper core class; the Angular service should depend on that capability port, not the root facade.

Fix: Keep `PlannerPlanTransferCapability` as the transfer port. Keep transfer tests on port/capability behavior rather than root-store mocks. Keep browser APIs behind the existing download, clipboard, and location adapters.

### Workspace Root Slimming

Definition: Slim `PlannerStoreService` into the planner composition Module: dataset and solver connections, persistence wiring, workspace/session/project lifecycle hooks, workbench shell focus hooks, and capability construction.

Reason: The root should coordinate high-level planner lifecycle, not be the Interface for every panel. Keeping per-capability forwards on the root erases Locality and makes future work harder to review.

Fix: Keep root access only for runtime construction/composition. Do not leave aliases for convenience when future capability work moves a consumer.

## Surface Map

| Consumer | Current dependency | Review guidance |
| --- | --- | --- |
| `apps/web/src/features/planner/planner-page.component.ts` and `.html` | Runtime construction only through `PlannerStoreService`; dataset load/error through `DatasetService`; solver status through `PlannerSolverService`; active session/project navigation through `PlannerWorkspaceSlice`; workbench panel/focus state through `PlannerWorkbenchSlice`; graph toolbar and renderer bindings through `PlannerGraphStore`; share/import orchestration through transfer; graph target amount edits through plan config. | Keep this split. The page may privately inject the root runtime to ensure composition hooks exist, but page HTML should bind to the owning capability rather than `store.*`. |
| `apps/web/src/features/planner/transfer/planner-plan-transfer.service.ts` | Transfer capability port with dataset, active project, active session projects, graph flush, and import-project operations. | Keep browser orchestration separate from transfer preparation and decoding. |
| `apps/web/src/features/planner/workbench/planner-targets-section.component.ts` and `.html` | Active project targets/notes, item options, plan lock, add/duplicate/remove/update targets, set/clear notes. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-inputs-section.component.ts` and `.html` | Active project id, item options, external input rows, plan lock, set/move/remove item inputs. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-resources-section.component.ts` and `.html` | Resource rows, plan lock, set/reset resource caps and enabled state, bulk resource commands. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-recipes-section.component.ts` and `.html` | Recipe search, recipe rows, plan lock, recipe enable/bulk/group commands. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-machines-section.component.ts` and `.html` | Machine rows, usage summary, plan lock, machine enable command. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-objectives-section.component.ts` and `.html` | Active project objective profile, raw resource multiplier rows, plan lock, objective preset/weight/multiplier commands. | Plan Config Capability. |
| `apps/web/src/features/planner/workbench/planner-display-section.component.ts` and `.html` | Active project graph display settings and display commands. | Plan Config Capability for persisted display intent. Graph renderer remains an Adapter consumer of those settings. |
| `apps/web/src/features/planner/workbench/planner-defaults-panel.component.ts` and `.html` | User defaults, default rows/search, default recipe/machine/resource/objective/display commands, save active plan as defaults, reset defaults. | Defaults Capability. |
| `apps/web/src/features/planner/workbench/planner-inspector.component.ts` and `.html` | Inspector view model, solve error, selected node navigation. | Graph Capability for inspector model and graph selection. Solver status may stay on Workspace Root until a solve-status capability exists. |
| `apps/web/src/features/planner/workbench/selected-node-inspector.component.ts` and `.html` | Selected-node inspector model, clear selection, selected node done/note commands. | Graph Capability. |
| `apps/web/src/features/graph/production-graph.component.ts` and `adapters/` | No direct `PlannerStoreService` dependency found; receives graph inputs and emits renderer events through the planner page. | Keep as graph renderer Adapter. It should not inject planner capabilities unless a future graph host Module intentionally owns that boundary. |
| Planner component/service tests that mock `PlannerStoreService` | Planner page tests now mock `DatasetService`, `PlannerSolverService`, `PlannerWorkspaceSlice`, `PlannerWorkbenchSlice`, graph, plan config, and transfer directly. | Continue testing the capability Interface used by the subject. Root runtime tests should focus on composition, persistence/solver wiring, lifecycle hooks, and workspace initialization. |

## Capability Interface Notes

- A capability Interface should be named by the use case it owns, not by the file it came from.
- Avoid exposing `workbenchViews` and `graphView` as giant bags on new capabilities. Split read models by what the consumer needs.
- Plan Config and Defaults can share pure helpers, but they should not share a mutable Angular service Interface unless one consumer genuinely edits both.
- Graph Capability should expose renderer-neutral models only. Foblex Flow remains behind the graph feature Adapter Seam.
- The root may pass ports into capabilities. Ports should be narrow and typed; unchecked `any` is not an acceptable shortcut.

## Anti-Goals And Review Guardrails

- Do not create new shallow pass-through stores. A new Module must own a real use case with enough Depth to survive the deletion test.
- Migrate consumers first. Do not add a new root forward and call that a capability extraction.
- Delete root forwards as they become unused. If a forward cannot be deleted after migration, the consumer map is incomplete.
- Each capability must have tests at its Interface, not only tests for lower-level pure helpers.
- Keep runtime behavior stable unless the refactory explicitly says otherwise.
- Keep renderer-specific types out of planner-core, solver code, persistence, exported plan formats, and planner-store capabilities.
- Keep Angular components thin: parsing and local draft UI state can stay nearby, but solver, parser, graph conversion, persistence, and capability mutation logic should not move into templates/components.

## Completed Sequence And Follow-Up

1. Transfer moved behind `PlannerPlanTransferCapability` and browser adapters.
2. Graph interaction moved behind `PlannerGraphStore`.
3. Workbench plan-editing panels moved to `PlannerPlanConfigStore`.
4. Global defaults moved to `PlannerDefaultsStore`.
5. Session/project lifecycle stayed in `PlannerWorkspaceSlice`.
6. `PlannerStoreService` was slimmed to runtime composition, persistence/solver wiring, lifecycle hooks, and destroy-time graph flushing.
7. Future root changes should preserve the no-convenience-forward rule.

## Open Questions

- Should solve status stay on `PlannerSolverService`, or become a smaller solve-status capability if more non-page consumers need it?
- When a workspace dashboard is added, should it consume `PlannerWorkspaceSlice` directly or introduce a route-level dashboard capability for session overview state?
