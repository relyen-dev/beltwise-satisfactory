# RFC: Planner Store Capability Refactor

Status: Draft refactor guide

## Summary

`PlannerStoreService` is now a broad root facade for workspace state, plan editing, graph interaction, defaults, transfer, view selectors, persistence, and solver wiring. The current slices are useful prior art, but later refactors should extract deep capability Modules with real Interfaces rather than moving one-line forwards into new shallow stores.

Use this RFC as the surface map for the next refactories. The goal is more Depth and Locality: a component should depend on the capability that owns its use case, and deleting a root-store forward should prove the extraction created Leverage instead of another pass-through Seam.

## Current Root Shape

`PlannerStoreService` currently composes:

- Workspace lifecycle: sessions, projects, active project, user defaults, persistence initialization.
- Plan config commands: targets, external inputs, resources, recipes, machines, objectives, plan notes, graph display settings.
- Graph commands and read model: production graph, selection, node notes/done state, layout, locks, inspector model.
- Defaults commands and default-facing rows.
- Transfer commands for plan JSON and share payloads.
- Dataset and solver status signals.
- Workbench panel focus state.

The biggest smell is not file size by itself. The smell is that many public root methods are one-line forwards with no capability Interface of their own, so consumers learn the whole root store instead of the Module they actually use.

## Refactories

### Store Surface Map

Definition: Keep an explicit map from each root-store consumer to the future capability Interface it should depend on.

Reason: Without the map, extractions can become shallow renames. The map makes migration consumer-first and gives each change a deletion test: when a consumer moves, the matching root forward should become unused.

Fix: Update this RFC before adding a new planner-store facade. Use the surface map below to choose one consumer slice, migrate it to the intended capability, then delete root forwards as they fall out of use.

### Plan Config Capability

Definition: A capability Module for editing one active plan's persisted intent and display configuration: targets, external inputs, resource caps, recipe and machine availability, objective profile, plan notes, and renderer-neutral graph display settings.

Reason: Workbench sections currently reach through the root store for command methods and broad view groups. That couples dense UI panels to unrelated workspace, transfer, and graph lifecycle APIs.

Fix: Create a focused Interface that exposes plan-config views and commands used by the workbench. Keep plan-lock enforcement inside the capability or behind a small graph-state port. Add tests at this Interface for lock behavior, target/input updates, bulk toggles, objective edits, and display settings.

### Graph Capability

Definition: A capability Module for renderer-neutral graph state and interaction: production graph read model, selected node, inspector view model, node done/note state, plan/layout locks, layout reset, debounced node position commits, and flush-before-navigation behavior.

Reason: Graph concerns currently span `graphView`, `PlannerGraphBuildSlice`, shell host listeners, inspector components, and parent-to-`ProductionGraphComponent` bindings. Keeping this as one capability protects the graph Adapter Seam while making graph interactions independently testable.

Fix: Expose a graph Interface consumed by the planner page, inspector, selected-node inspector, and graph host bindings. Keep Foblex-specific types in `apps/web/src/features/graph` and `adapters/`. Test selection, notes, done state, lock behavior, layout reset, and position flushing through the capability Interface.

### Defaults Capability

Definition: A capability Module for user default settings: default recipe/machine/resource/objective/display rows, search state, commands, `saveActivePlanAsDefaults`, and reset-to-built-ins.

Reason: Defaults mirror plan config concepts but mutate `PlannerUserDefaults`, not the active project. Mixing both surfaces through the root store makes it easy to accidentally use plan commands in the defaults panel or vice versa.

Fix: Give the defaults panel a defaults-only Interface. Share pure selector and mutation helpers with plan config where useful, but keep the Angular capability boundary separate. Tests should assert default mutations, save-from-active-plan, reset behavior, and dataset-baseline resource caps.

### Transfer Capability

Definition: A capability Module for plan JSON export/import and compact share payload export/import, including browser Adapters for download, clipboard, and hash location.

Reason: `PlannerPlanTransferService` currently depends on `PlannerStoreService`, which hides the real ports it needs: dataset, active project, active session projects, graph flush, and project import. Transfer already has a deeper core class; the Angular service should depend on that capability port, not the root facade.

Fix: Promote the transfer port as the Interface. Migrate transfer tests away from root-store mocks toward port/capability tests. Keep browser APIs behind the existing download, clipboard, and location Adapters.

### Workspace Root Slimming

Definition: Slim `PlannerStoreService` into the planner composition Module: dataset and solver connections, persistence wiring, workspace/session/project lifecycle, workbench shell focus, and capability construction.

Reason: The root should coordinate high-level planner lifecycle, not be the Interface for every panel. Keeping per-capability forwards on the root erases Locality and makes future work harder to review.

Fix: Migrate consumers first. Keep root access only where the planner shell genuinely spans workspace, dataset load state, active session/project navigation, and capability composition. Delete forwards once no production consumer uses them; do not leave aliases for convenience.

## Surface Map

| Current consumer | Root surface used today | Future dependency |
| --- | --- | --- |
| `apps/web/src/features/planner/planner-page.component.ts` and `.html` | Dataset load/error, solver status, active session/project navigation, workbench panel state, graph toolbar and renderer bindings, share/import orchestration, root graph flush before unload. | Workspace Root for shell/navigation/load state; Graph Capability for toolbar, renderer-neutral graph bindings, selection, locks, layout, and flush; Transfer Capability through `PlannerPlanTransferService`; Plan Config Capability only for graph target amount edits. |
| `apps/web/src/features/planner/transfer/planner-plan-transfer.service.ts` | `exportActivePlan`, `importPlanJson`, `exportActivePlanSharePayload`, `importPlanSharePayload`. | Transfer Capability port with dataset, active project, active session projects, graph flush, and import-project operations. |
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
| Planner component/service tests that mock `PlannerStoreService` | Broad root-store test doubles. | Test the capability Interface used by the subject. Root-store tests should shrink toward composition, persistence/solver wiring, and workspace lifecycle. |

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

## Suggested Sequence

1. Start with Transfer Capability because it already has a port-shaped core and only one production Angular service consumer.
2. Extract Graph Capability next to protect the renderer Adapter Seam before changing more workbench panels.
3. Move one workbench panel at a time to Plan Config Capability, deleting each matching root forward when unused.
4. Extract Defaults Capability after Plan Config naming settles, so mirrored default commands use consistent vocabulary without sharing the wrong Interface.
5. Slim Workspace Root last, once only shell/navigation/load-state consumers remain.

## Open Questions

- Should plan-lock state belong entirely to Graph Capability, or should Plan Config Capability expose an `editingLocked` signal derived from graph build state through a port?
- Should solve status remain on Workspace Root, or become a small solving capability once graph and inspector consumers are migrated?
- Should workbench panel focus stay on Workspace Root, or become a separate shell/workbench capability if planner page continues to grow?
