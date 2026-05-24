# RFC: Planner Next Roadmap

Status: Draft backlog

## Summary

The graph canvas is now solid enough that the next product layer should make Beltwise feel more like a full planning workspace rather than only a single-factory graph solver. This RFC organizes current ideas into coherent initiatives, separates near-term polish from larger future systems, and keeps speculative save/logistics/map work out of the committed MVP path until the data model is ready.

Primary themes:

- Make the planning panels more visual, faster to scan, and less checkbox-heavy.
- Add item and machine icons in restrained places that improve recognition without cluttering the graph.
- Let users define their own defaults for new plans.
- Grow current game sessions from plan grouping into saves, defaults, notes, and linked factories.
- Grow from one-factory planning toward save-wide planning through plan links and logistics capacity models.
- Keep advanced map, save, logistics, and layout ideas behind abstractions so the core planner stays readable.

## Product Thesis

Most factory planners help users solve one production graph at a time. Beltwise can become more valuable by treating each graph as one factory inside a larger save.

The long-term differentiator is session-scale planning:

- Plan individual factories with the current graph-first workflow.
- Group those factories under a game session.
- Link exports from one plan into inputs for another plan.
- Add logistics capacity between those links.
- Zoom out from individual plans into a session overview that shows item flow between factories.
- Warn when a train, truck, drone, belt, pipe, or shared production pool cannot support the connected demand.

The first supporting layer is now in place: stronger panels, icons, defaults, plan transfer, sessions, objective presets, inspector summaries, notes, and focused planner state capabilities. The next roadmap decisions should choose the next product surface deliberately, with the workspace dashboard and linked-plan contract as the main stepping stones toward session-scale planning.

## Related Documents

- [Workbench UX Polish](./workbench-ux-polish.md) covers existing recipe/resource panel polish notes.
- [Resource Providers, Save Imports, And Randomized Nodes](./resource-providers.md) covers save-file import and randomized-node research.
- [Sinks, Disposal, And Power Targets](./sinks-disposal-and-power-targets.md) captures follow-up work for direct sinks, target-output sinks, conversion-to-sink, nuclear waste, and power-generator planning.
- [Plugin-Shaped Extension Seams](./plugin-extension-seams.md) captures when expanded features should become optional extension seams instead of built-in planner behavior.
- [Product Spec](../product-spec.md) remains the north star for current scope and MVP boundaries.
- [Architecture](../architecture.md) defines current package boundaries and renderer isolation.

## Design Principles

- Keep the graph as the main planning surface.
- Treat panels as tools that edit planner intent, not modal setup screens.
- Prefer readable dense controls over oversized decorative UI.
- Keep domain logic outside Angular templates and components.
- Preserve semantic controls even when visual checkboxes are hidden.
- Keep renderer-specific graph behavior out of persisted plans and core packages.
- Persist user intent and settings, not solver output.
- Keep save files local-only unless a future feature explicitly introduces server behavior.
- Do not copy another planner's exact layout, colors, row treatment, node styling, or navigation chrome.
- Consider plugin-shaped seams for optional, user-selectable, or niche capabilities before making the core planner own every expanded feature.

## Completed Foundation Sweep

The initial workspace-priority set is implemented:

1. Planning panel refresh for Recipes and Machines.
2. Restrained item and machine icon placements.
3. Contextual inspector overhaul.
4. User-configurable global defaults for new plans.
5. Plan JSON import/export and compact share links/codes.
6. First-pass game sessions that group plans.
7. Objective presets, custom objective weights, and raw-resource route multipliers.
8. Plan notes and node-note polish.
9. Planner state capability refactor that slimmed `PlannerStoreService` into runtime composition.

## Next Candidate Set

These are plausible next steps before the larger save/logistics systems. Some are cleanup passes that can reduce risk before adding more stateful features.

1. Design a workspace dashboard/navigation entry point that can lead to factory plans, session views, defaults, transfer actions, and future save-wide planning.
2. Add browser smoke tests for graph rendering, planner editing, persistence reload, plan transfer, and infeasible/error states.
3. Improve graph connection display controls.
4. Add drill-in graph views for special production loops.
5. Design the linked-plan contract model before implementing logistics.
6. Extend sessions with only the metadata needed for save imports, linked plans, or notes once one of those features is pulled forward.
7. Continue sink/disposal planning from direct surplus sinks toward explicit target-output sinks, conversion-to-sink, nuclear waste handling, and power targets.
8. Keep doing small technical refactors only where a capability or workbench slice has become hard to test or review; avoid recreating a broad planner facade.

## Future Systems

These are high-value ideas, but they need more data-model work and research before implementation.

1. Game sessions beyond plan grouping: save imports, defaults, notes, locations, and logistics.
2. Save imports that initialize session defaults or update plan settings.
3. Randomized resource node support through save-derived resource providers or seed reproduction.
4. Linked plans where exports from one plan supply inputs to another.
5. Train, drone, truck, or belt logistics capacity models.
6. Session logistics overview where plans become nodes and item flows become edges.
7. Lightweight planned-location mapping.
8. Wiki/knowledge integration.
9. Top-down factory layout generation.
10. First-party extension seams for optional reports, graph overlays, layout strategies, export formats, or data packs.
11. Power-generator targets with fuel selection, maximize-power planning, and explicit byproduct or waste handling.

## Idea Index

This index keeps the original brainstorm traceable while the rest of the RFC groups related work by system.

| Idea                                      | Area                       | Current placement                                                                              |
| ----------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Planning panel improvements               | UX                         | [Planning Panels](#planning-panels)                                                            |
| Item and machine icons                    | UX/data assets             | [Icons](#icons)                                                                                |
| User defaults                             | Persistence/settings       | [User Defaults](#user-defaults)                                                                |
| Export/import                             | Persistence/sharing        | [Import And Export](#import-and-export)                                                        |
| Save importing for defaults/plan settings | Sessions/save import       | [Sessions And Saves](#sessions-and-saves)                                                      |
| Randomized node maps                      | Resource providers         | [Sessions And Saves](#sessions-and-saves) and [resource-provider RFC](./resource-providers.md) |
| Game sessions                             | Persistence/product model  | [Sessions And Saves](#sessions-and-saves)                                                      |
| Linked plans                              | Session-scale planning     | [Linked Plans](#linked-plans)                                                                  |
| Train/vehicle logistics                   | Session-scale logistics    | [Logistics](#logistics)                                                                        |
| Save-wide logistics overview              | Session-scale logistics UX | [Session Logistics Overview](#session-logistics-overview)                                      |
| Solver priorities                         | Solver/UI                  | [Solver Objectives](#solver-objectives)                                                        |
| Inspector overhaul                        | UX                         | [Inspector](#inspector)                                                                        |
| Plan/session notes                        | Persistence/UX             | [Notes](#notes)                                                                                |
| Graph connection controls                 | Graph UX                   | [Graph Connection Controls](#graph-connection-controls)                                        |
| Wiki or knowledge links                   | Knowledge/help             | [Wiki And Knowledge Links](#wiki-and-knowledge-links)                                          |
| Planned locations/map                     | Session/location planning  | [Planned Locations And Map](#planned-locations-and-map)                                        |
| Recycled rubber/plastic drill-in          | Graph explanation          | [Drill-In Production Views](#drill-in-production-views)                                        |
| Top-down factory layout                   | Future layout system       | [Top-Down Factory Layout](#top-down-factory-layout)                                            |
| Optional reports/overlays/layouts         | Extension seams            | [Plugin-shaped extension RFC](./plugin-extension-seams.md)                                     |

## Planning Panels

The panel model has moved away from plain checkbox lists, with clickable enabled/disabled rows and stronger icon-backed scanning. Remaining polish should keep the same underlying recipe, machine, resource, objective, and display settings while making common choices faster to recognize.

Current recipe panel direction:

- Keep the existing list mode because it is efficient for power users.
- Keep checkboxes semantic while making the row surface the main interaction.
- Show enabled/disabled state with row treatment and compact status text rather than relying only on a checkbox square.
- Keep base recipes and alternates distinct, but do not copy another planner's tab or row treatment.
- Add row metadata gradually: output items, ingredient items, machine, duration, and whether the recipe is used by the current solution.
- Support filters such as `All`, `Enabled`, `Disabled`, `Base`, `Alternate`, `Used`, and `Unlocked` when unlock state exists.

Item-centric recipe mode:

- Add a second recipe workflow behind panel tabs, such as `Recipes` and `Items`.
- In item mode, show item tiles or rows with icons and display names.
- Clicking an item opens an inline section, popover, or drawer listing recipes that produce or consume that item.
- Let users enable or disable base and alternate recipes from that item-specific recipe list.
- Show alternates as recipe choices tied to the item instead of one large global alternate list.
- Make it clear when changing a recipe affects other items, especially recipes with multiple outputs or byproducts.
- Keep the list mode available because global review and bulk toggling are still useful.

Machine panel direction:

- Consider compact machine tiles with icons, display names, power, and enabled state.
- Use the same visual language as recipe rows: clickable surface, hidden semantic checkbox, subtle active highlight.
- Group machines by role when useful, such as extraction, smelting, manufacturing, fluids, and late-game.
- Show disabled machines as unavailable solver capacity, not as deleted data.
- Add `Used in current plan` filtering once solution context is available in the panel.

Display panel direction:

- Keep it utility-first and compact.
- Group graph settings into stable sections: transport labels, edge style, precision, flow animation, layout/reset controls, and future connection controls.
- Avoid making Display a visual theme editor until the core planner settings are mature.

Resource panel direction:

- Keep resource caps separate from recipe and machine availability.
- Use subtle active/custom row states.
- Make custom caps and disabled resources obvious at a glance.
- Leave save-derived and seed-derived resource presets behind the resource provider work.

## Icons

Icons should improve recognition and scan speed without taking over the layout.

Current asset direction:

- Use the existing extractor work as the source of item and machine icons.
- The app currently resolves icons by deterministic public paths such as `/game-icons/Desc_IronPlate_C.png`.
- Machine icons map build IDs to descriptor-style icon IDs, such as `Build_ConstructorMk1_C` to `Desc_ConstructorMk1_C`.
- Keep icons optional so the app remains usable when files are missing.
- Use text-first fallbacks for every icon placement.
- Review Coffee Stain/community asset guidance before bundling extracted assets publicly.

Future asset questions:

- Decide whether to commit smaller `64x64` or `128x128` variants instead of the current extracted source size.
- Decide whether a generated manifest is useful beyond deterministic public paths.
- Decide whether the upcoming map PNG should live with generated public assets, and what size/tiling strategy is appropriate before any map UI exists.

Good first placements:

- Product target item selector.
- External input selector.
- Recipe row outputs and ingredients.
- Item-centric recipe mode tiles.
- Machine panel rows or tiles.
- Inspector selected item, recipe, or machine summary.
- Graph nodes as small supporting visuals, not the primary label.

Graph icon guidance:

- Keep icons small and aligned to existing node structure.
- Prefer one primary icon per node area rather than icon strips everywhere.
- Do not let icons resize nodes or change graph layout.
- Avoid icon-only graph labels; graph nodes must still be readable from text.
- Use icons more strongly in the inspector where space and context are better.

## User Defaults

User defaults should let a player make Beltwise start new plans the way they think, without changing existing plans unexpectedly.

Possible default profile fields:

- Enabled alternate recipes.
- Disabled base recipes, if the user intentionally excludes them.
- Enabled or disabled machines.
- Resource caps and disabled resources.
- External input presets, if later useful.
- Objective profile weights and raw resource multipliers.
- Graph display settings.
- Preferred max belt and pipe tiers.
- Preferred panel mode, such as list recipe mode or item-centric recipe mode.

Behavior:

- Defaults apply to newly created plans.
- Existing plans keep their own saved settings unless the user explicitly applies defaults to them.
- Users can save the current plan configuration as their default profile.
- Users can reset defaults back to Beltwise defaults.
- Imported save/session settings may offer to update defaults, active plan settings, or both.
- Persist defaults as versioned local state, separate from individual plan state.
- Do not persist solved outputs or derived graph data as defaults.

Useful UX:

- `Use current plan as defaults`.
- `Apply defaults to this plan`.
- `Reset to Beltwise defaults`.
- A small summary of what differs from Beltwise defaults.
- A clear distinction between app defaults, session defaults, and per-plan overrides if sessions are added.

## Import And Export

Import/export should give users confidence that local-first planning does not mean fragile planning. It also creates a path for sharing plans, debugging examples, and moving work between browsers before any account or server feature exists.

Plan export first:

- Export one plan as a versioned JSON file.
- Include persisted user intent: targets, recipe overrides, machine overrides, resource overrides, external inputs, objective profile, graph display settings, manual layout, build-state node notes, and plan notes.
- Include dataset identity and source fingerprint so stale or mismatched imports can be explained.
- Do not export solver output as authoritative state.
- Re-solve after import using the local generated dataset.
- Validate imported files through schemas before storing them.

Plan import behavior:

- Import as a new plan by default.
- Let users rename the imported plan before or after import.
- Warn when the file references a different dataset or game version.
- Preserve imported manual graph layout where logical node IDs still match.
- Keep invalid or unknown future fields from crashing the app.

Session export later:

- Export a whole session with its plans, defaults, notes, linked plan contracts, logistics routes, map/location notes, and sink links.
- Keep save-file snapshots out of exports by default unless the user explicitly includes them.
- Include enough metadata to explain where session settings came from, such as manual, imported save, or custom default profile.

Current sharing:

- Compact `bw.p` payloads support copy/paste codes and `#plan=` links.
- Share payloads contain plan intent/configuration, including non-empty plan and node notes, not solver output.
- Public or server-backed sharing should remain future work.
- Keep local JSON import/export useful alongside share links.

## Sessions And Saves

A session should represent a Satisfactory game world/save context. It can group plans without forcing every user into save management.

Beltwise now has a first-pass session model that groups plans in local workspace
state. The current implementation intentionally stops there: no save import,
session defaults, linked plans, logistics, map pins, session-wide balance, or
session import/export yet.

Session model direction:

- Plans can remain standalone for users who only want quick planning.
- A session can contain many plans.
- A session can store a display name, Satisfactory session name, optional save metadata, notes, defaults, and resource provider settings.
- A plan can inherit from session defaults at creation time, then keep its own explicit overrides.
- A session can later own plan links, logistics routes, map pins, and imported save snapshots.

Save import direction:

- Save files should be parsed locally in the browser.
- Save import can initialize or update session data rather than becoming mandatory plan setup.
- Potentially useful save-derived settings include unlocked alternate recipes, game/session name, resource randomization settings, resolved resource node overrides, and maybe logistics data later.
- Users should choose whether imported data updates session defaults, the active plan, or a new plan.
- Save import should not overwrite user plan intent silently.

Randomized nodes:

- Keep randomized resource limits behind `ResourceProvider`.
- Prefer save-derived resolved node overrides if seed reproduction remains uncertain.
- Keep seed-only support as separate research until the algorithm can be independently validated.
- See [Resource Providers, Save Imports, And Randomized Nodes](./resource-providers.md) for current probe findings.

## Linked Plans

Linked plans would move Beltwise from a single factory planner toward a save-wide production planner.

Concept:

- A plan can expose one or more exports.
- Another plan can consume an export as an external input.
- A linked export can supply all or part of another plan's demand.
- Session-level balance can show surplus, shortages, and overcommitted production.

Possible link types:

- Manual link: user says `Plan A exports 120 Rubber/min to Plan B`.
- Partial export: user reserves only part of an output for another plan.
- Shared pool: multiple plans contribute to or consume from a named item pool.
- Sink link: unused output is intentionally routed to an AWESOME Sink or conceptual sink.
- Logistics-backed link: link capacity is limited by a train, drone, truck, belt, or pipe route.

Rules to protect clarity:

- Keep each individual plan solvable from its own persisted intent.
- Treat linked inputs as user/session intent, not as authoritative solver output copied from another plan.
- Recompute linked balances when source or destination plans change.
- Warn when downstream demand exceeds upstream available export.
- Avoid circular dependency solving at first; detect cycles and explain them.

## Logistics

Logistics can eventually answer whether a session-wide plan is physically supportable, not just mathematically producible.

Manual logistics first:

- Let users create a route with a name, mode, item, capacity per minute, and optional notes.
- Modes could include belt, pipe, truck, train, drone, or generic transport.
- A route can connect plan exports to plan inputs.
- Show warnings when linked plans request more throughput than the route capacity.

Save-derived logistics later:

- Research whether saves contain enough train timetable, station, vehicle, inventory, and travel-time data for useful throughput estimates.
- Treat imported logistics as a draft model that users can correct.
- Avoid promising exact in-game performance unless the save data and assumptions support it.
- Keep train and vehicle parsing separate from the core solver.

Potential calculations:

- Train route round-trip time.
- Freight car item stack capacity.
- Route capacity by item per minute.
- Station loading or unloading bottlenecks.
- Planned demand versus route capacity.

## Session Logistics Overview

The session overview is the zoomed-out counterpart to the factory graph. Instead of showing recipes and machines inside one plan, it should show factories, item exports, imports, shared pools, and logistics routes across the whole save.

Concept:

- Treat plans as high-level nodes.
- Treat item transfers as edges between plans or logistics nodes.
- Treat trains, trucks, drones, belts, pipes, and shared pools as first-class logistics nodes when that makes the network easier to understand.
- Show item, amount per minute, and route/capacity status on each edge.
- Let users follow a flow from raw extraction plans through intermediate factories to final assembly plans.
- Highlight shortages, unused exports, overloaded routes, and disconnected demand.
- Let users jump from a session edge back into the source plan, destination plan, or logistics route.
- Let users click a logistics node to inspect connected inputs, outputs, excess capacity, and overused capacity.

Possible views:

- `Factories`: plan-to-plan flow graph.
- `Items`: selected item flow across all plans.
- `Routes`: logistics capacity and overload view.
- `Balance`: session-wide produced, consumed, imported, exported, and short amounts by item.

Possible node types:

- Factory plan node: a solved plan with declared exports and linked inputs.
- Train route node: one train route or timetable-backed service.
- Vehicle route node: truck, tractor, or explorer logistics path.
- Drone route node: one drone port pair or route group.
- Belt or pipe trunk node: a manually declared high-throughput connection.
- Shared pool node: a named depot or bus where multiple plans contribute and consume.
- Sink node: an AWESOME Sink or conceptual disposal endpoint for unused outputs.

Logistics node inspector:

- Connected source plans and their supplied item rates.
- Connected destination plans and their demanded item rates.
- Capacity by item or transport route.
- Excess available rate when supply/capacity exceeds demand.
- Overused rate when demand exceeds supply or route capacity.
- Route notes and assumptions.
- Links back to connected plans and relevant item flows.

Sink node behavior:

- Let unused factory outputs be explicitly routed to sink nodes.
- Show sink points per minute when item sink-point values are available in generated data.
- Distinguish intentional sinking from accidental unused surplus.
- Support plan-level sink nodes first, then session-level sink destinations later.
- Include sunk items in session balance so users can see what is consumed, exported, unused, or intentionally sunk.

Design direction:

- This should feel like a strategic map of the save, not a duplicate of the recipe graph.
- Keep the first version schematic and planner-owned rather than trying to render the in-game world map.
- Use the same renderer-neutral graph boundary idea so the overview renderer can evolve independently.
- Make logistics first-class: routes should be selectable objects with capacity, notes, status, and connected plans.

## Solver Objectives

The planner now exposes objective presets without requiring users to understand LP internals. Fixed outputs remain fixed; objective priorities only choose among feasible production routes. Maximize targets still solve before any route preference.

Implemented objective presets:

- `Resource Efficient`: default raw-resource-first behavior, then surplus, machines, and power.
- `Low Power`: prioritizes lower power before raw-resource tie breakers.
- `Few Machines`: prioritizes lower machine/recipe activity before raw-resource tie breakers.
- `Low Surplus`: prioritizes lower unused byproducts before raw-resource tie breakers.
- `Balanced`: uses one blended weighted stage across resources, power, machines, and surplus.
- `Custom`: user-edited weights while preserving the current objective strategy/order.

UX notes:

- Explain presets through concise labels and tooltips, not solver math.
- Keep advanced weights in the custom editor.
- Keep raw-resource route multipliers available for players who want to favor or avoid specific raw resources without changing availability caps.
- Show the active objective profile in the Objectives workbench and inspector summary.
- Add focused solver tests whenever objective behavior changes.

## Inspector

The inspector should become contextual, helping users understand the selected thing and jump to relevant controls.

No selection:

- Plan status.
- Output targets summary.
- Total power.
- Machine count summary.
- Raw resource usage summary.
- Warnings and infeasible reasons.
- Active objective profile.

Recipe node selection:

- Recipe name and enabled state.
- Machine, machine count, clocking assumption, and power.
- Inputs and outputs per minute.
- Ingredients that are constrained or externally supplied.
- Link to recipe controls.
- Node note and done state.

Resource node selection:

- Raw resource usage per minute.
- Current cap and remaining headroom.
- Source of cap: static baseline, custom, session/save, or randomized provider.
- Link to resource controls.

Output node selection:

- Requested target mode and amount.
- Achieved amount for maximize targets.
- Upstream path focus actions.
- Links to linked-plan export/import details later.

External input selection:

- Supplied item and amount per minute.
- Whether it is manual, linked from another plan, or logistics-backed.
- Link to input/link controls.

Edge selection:

- Item flow per minute.
- Suggested belt/pipe count from current display settings.
- Source and destination nodes.
- Future logistics/link status where relevant.

## Notes

Notes can support both planning and construction tracking.

Useful note scopes:

- Plan notes: implemented as plain-text project notes that persist locally and transfer through plan export/import and compact share payloads when non-empty.
- Node notes: implemented as plain-text graph-node notes; visible and stale notes are summarized in the inspector without deleting stale state automatically.
- Session notes.
- Linked export/input notes.
- Logistics route notes.
- Map/location notes later.

Notes should remain plain and local-first. Rich formatting, backlinks, or attachments can wait until the core note scopes are proven useful.

## Graph Connection Controls

The graph already has a renderer boundary, so future connection polish should preserve that separation.

Possible controls:

- Straight versus curved edges.
- Edge label density.
- Transport label visibility.
- Flow animation.
- Selected-path highlighting.
- Merge or split parallel item flows.
- Per-item or per-role edge coloring.
- Edge routing waypoints or pins.
- Hide low-volume byproduct edges below a user threshold.
- Focus graph by item, recipe, machine, or selected plan path.

Implementation rule:

- Persist renderer-neutral display intent.
- Keep Foblex-specific edge handles, coordinates, and path details inside the graph feature layer.

## Wiki And Knowledge Links

External knowledge can help users understand recipes and items, but it should not become a required dependency for planning.

Options:

- Add external wiki links from item, recipe, and machine inspector sections.
- Generate links from stable names or known IDs where reliable.
- Add a small `Open wiki` action instead of embedding large pages.
- Build a lightweight local knowledge panel later if enough facts can be generated from game docs.

Risks:

- External wiki URLs and page names can change.
- Some wiki content may be broader than the planner needs.
- Beltwise should avoid presenting copied wiki text as its own documentation.

## Planned Locations And Map

A lightweight location model could help users remember where factories belong without becoming a full map clone.

Possible first version:

- Let users assign a plan to a named location, such as `Rocky Desert starter iron`.
- Optional biome/region tag.
- Optional freeform coordinates if the user knows them.
- Optional note.
- Session-level list of planned locations.

Later:

- Simple schematic map panel or minimap-like board.
- User-created pins and rough regions.
- Resource-provider-aware location suggestions, if node data exists.

Boundary:

- Do not mimic Satisfactory Calculator's interactive map, asset treatment, or save-editor scope.
- Keep location planning secondary to production planning.

## Drill-In Production Views

Some solved graphs naturally contain loops or dense clusters. A drill-in view can explain one subsystem without replacing the main graph.

Candidate: recycled rubber/plastic.

- Keep the main graph accurate, even if the loop is compact.
- Add an action from a loop or recipe node to open a derived subgraph.
- Show the loop as a linearized production explanation when that is easier to understand.
- Make clear that the drill-in view is explanatory and derived from the same solved plan.
- Avoid saving drill-in output as authoritative plan state.

This idea can generalize to other dense chains, byproducts, nuclear handling, packaged fluid loops, and late-game conversion chains.

## Top-Down Factory Layout

Turning a solved plan into a top-down build layout would be a major feature, likely separate from graph planning.

Possible ambition:

- Group solved recipe/machine requirements into buildable factory blocks.
- Estimate machine footprints.
- Arrange machines into rows or production cells.
- Route simple belts and pipes in 2D.
- Show manifold or load-balancing assumptions.
- Export a conceptual layout users can build from.

Hard parts:

- Machine dimensions, clearances, lifts, splitters, mergers, pipes, fluids, power, floors, verticality, and player taste.
- Integer machine counts and clocking choices.
- Belt and pipe routing that remains legible.
- Avoiding false precision: a pretty layout is not necessarily buildable in-game.

Recommended path:

1. Add better machine count and grouping summaries.
2. Add optional integer/clocking presentation.
3. Experiment with one simple layout archetype, such as straight-line manifolds.
4. Keep the layout generator separate from solver correctness.

## Suggested Sequence

1. Design and implement a workspace dashboard/navigation entry point so users can choose plans, defaults, session-level surfaces, and future save views without landing directly in the last graph.
2. Add browser smoke tests around graph rendering, planner editing, persistence reload, plan transfer, and infeasible/error states.
3. Add graph connection display controls and drill-in views.
4. Write a focused RFC for linked-plan contracts: exports, imports, item pools, and how those should interact with manual external inputs.
5. Extend the session data model only with fields needed by the linked-plan or save-import feature selected next.
6. Add session import/export after session-scoped data exists beyond plan grouping.
7. Prototype linked plans with manual links before logistics-backed links.
8. Add a schematic session logistics overview once linked plans exist.
9. Research save-derived logistics only after save import has a reliable parser boundary.
10. Treat planned locations and top-down factory layout as separate future RFCs before implementation.

## Open Questions

- Should item-centric recipe mode be a full tab, an alternate panel view, or a search result drilldown?
- When should session defaults be added, and should they override or only seed global defaults?
- When session export exists, should it export all plans by default or let users choose a subset?
- Which icon sizes should be committed: `64x64`, `128x128`, or both?
- How should the extracted map PNG and default node catalog be schema-validated and versioned before session/map planning uses them?
- How should public distribution handle extracted game icons and asset licensing/community guidelines?
- Should plan links be one-to-one explicit connections, named item pools, or both?
- How much save-derived data should be allowed to update an existing plan automatically?
- Are logistics routes best modeled as capacities first, or as physical objects first?
- Should the inspector own navigation actions into panels, or should panel controls remain independent and merely react to selection?
- What is the smallest useful planned-location feature that does not become a map clone?
