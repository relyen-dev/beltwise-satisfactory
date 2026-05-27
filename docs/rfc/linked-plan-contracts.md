# RFC: Linked Plan Contracts And Node Extraction

Status: Draft backlog

## Summary

Linked plans are the first concrete step from single-factory planning toward
session-scale planning. The core idea is simple: one plan can reserve part of
its output for another plan, and the receiving plan can treat that amount as an
external input.

The model should start with explicit, partial, manually edited links before
logistics, save imports, route capacity, or automatic session-wide solving. A
link is user intent stored at the session layer. It references plans and item
rates, then derives its current healthy, short, or overcommitted state from the
latest solves. It must not persist copied solver output as authoritative state.
See [Logistics Route Planning](./logistics-route-planning.md) for the future
route layer; this RFC treats links as supply contracts, not transport routes.

This RFC also covers the selected-node action tray and the "extract this
production node into another plan" workflow, because those actions are likely
to become the most natural way users create linked factories from an already
solved graph.

## Goals

- Let users connect an output from one plan to an input of another plan.
- Support partial amounts, such as exporting 80 of a 240/min output.
- Keep each plan understandable as its own factory plan.
- Keep links session-scoped so plan JSON/share payloads stay portable.
- Show source shortages, destination under-supply, and overcommitted exports.
- Provide a small selected-node action tray for common graph actions.
- Let users split a complex solved production node into a new or existing plan.
- Prepare the model for future logistics routes without implementing routes
  first.

## Non-Goals

- Do not add train, truck, drone, belt, or pipe capacity in the first link pass.
- Do not solve circular plan networks automatically.
- Do not make save import required for linked plans.
- Do not turn session links into persisted solver output.
- Do not make the graph renderer own link domain state.
- Do not replace the existing full inspector with the node action tray.

## Product Model

Current plans already have `itemInputs`, which represent materials supplied by
another factory. Linked plans should build on that mental model instead of
inventing a second kind of destination demand.

A link should not imply a belt, pipe, train, vehicle, or drone. It only says
that one plan's output is expected to cover another plan's external input.
Future logistics routes can explain how that material moves.

Recommended first model:

- A destination plan keeps an external input requirement by item and rate.
- A session link can satisfy all or part of that external input requirement.
- If inbound links provide less than the input requirement, the remaining amount
  is shown as manual or unlinked external supply.
- If inbound links provide more than the input requirement, the destination is
  overcovered and should warn instead of silently changing the plan.
- The destination plan remains solvable as a standalone plan because the
  external input requirement is still normal plan intent.
- Session links explain where that input is supposed to come from when the plan
  is viewed inside its session.

For source plans, links should reserve output without changing the source
production target:

- A fixed output target can export part or all of its requested rate.
- A maximize output target can export part of the solved rate when solved.
- A surplus or byproduct can be exported only when the current solved plan
  produces enough surplus.
- Link reservations and target-output sink reservations should be displayed
  against the same available output so users see when they overcommit a target.

## Contract Shape

A first implementation should keep the stored contract small and versioned:

```ts
interface PlannerSessionLink {
  id: string;
  itemId: ItemId;
  amountPerMinute: number;
  source: PlannerSessionLinkSource;
  destination: PlannerSessionLinkDestination;
  note?: string;
  paused?: boolean;
}

type PlannerSessionLinkSource =
  | {
      kind: 'target-output';
      projectId: string;
      targetId: string;
    }
  | {
      kind: 'surplus';
      projectId: string;
    };

interface PlannerSessionLinkDestination {
  kind: 'external-input';
  projectId: string;
  itemId: ItemId;
}
```

Keep source references precise where possible. Multiple output targets can
request the same item, so a target-output link should reference `targetId`, not
only `itemId`. Surplus links can remain item-based because current surplus is
already aggregated by item.

Likely later extensions:

- `name` or `label` for user-facing logistics names.
- `routeId` or `routeAllocationId` once logistics tracking exists.
- `poolId` for named item pools or depots.
- `sourceNodeId` for graph-node-derived links if stable enough.
- `createdAt` and `updatedAt` if session history becomes useful.
- `localUseAmountPerMinute` if output reservation becomes richer than links and
  sinks.

## Derived Link State

The stored link says what the user wants. Derived state says what is currently
true.

For each link, derive:

- source plan name and destination plan name
- requested amount per minute
- source available amount per minute
- destination input requirement amount per minute
- amount currently covered by this link
- short amount per minute
- source overcommit amount per minute
- destination overcoverage amount per minute
- status: `healthy`, `source-short`, `destination-overcovered`,
  `source-overcommitted`, `paused`, `missing-source`, or
  `missing-destination`

Session balance can then aggregate:

- produced by plan
- exported by plan
- imported by plan
- manually supplied or unlinked external input
- sunk output
- unused output or surplus
- short linked demand

The balance is derived from plan intent, solve results, and session links. It is
not persisted as authoritative state.

## Solver Behavior

The first link pass should avoid making the solver coordinate multiple plans.
Each plan still solves independently.

Recommended behavior:

- Destination plans continue to solve from their own `itemInputs`.
- Links validate whether those inputs have a declared session source.
- Creating a link may create or increase the destination `itemInputs` amount, but
  the link itself remains session-scoped.
- Editing a destination input should show linked coverage and manual remainder.
- Editing a link amount should optionally sync the destination input upward when
  the link would otherwise exceed the input requirement.
- Cycles between plans should be detected in the session graph and reported.
  They should not trigger recursive solving in the first pass.

This keeps the implementation compatible with the current solve input shape and
preserves plan export/share behavior.

## UX Surfaces

Minimum useful surfaces:

- Inputs panel: show each external input with linked coverage, manual remainder,
  and actions to link or unlink supply.
- Output target rows or inspector: show how much of a target is reserved for
  links, sinks, and unreserved output.
- Sinks panel: keep target-output sinks visible as a reservation that can
  conflict with linked exports.
- Plan dock or workspace dashboard: show plan-level import/export badges and
  warnings.
- Inspector: show linked input or export details for selected output, byproduct,
  and external input nodes.
- Session-level view later: show plans as nodes and item links as edges.

Avoid making the first UI depend on a full dashboard. A dashboard will become
more useful once links exist, but the link editor can start inside existing
Plan, Inputs, Sinks, and Inspector surfaces.

## Selected-Node Action Tray

The selected-node action tray should be a compact graph-adjacent control surface
for fast actions. It should complement the inspector, not replace it.

Initial action candidates:

- mark selected node done or not done
- edit node note
- focus upstream or downstream path
- sink surplus or target output when the existing sink rules support it
- open the owning workbench section

Link-related action candidates:

- expose selected output as a linkable export
- link selected output to another plan input
- create an external input from a selected assumed input
- extract selected production node into a new plan
- send selected production node to an existing plan

Implementation boundary:

- The graph renderer can display the tray and capture clicks.
- The available actions should be computed as renderer-neutral action
  descriptors from planner state selectors.
- Commands should call the owning capability, such as `PlannerGraphStore`,
  `PlannerPlanConfigStore`, or `PlannerWorkspaceSlice`.
- Do not add broad convenience forwards back to `PlannerStoreService`.

## Extract Production Node Workflow

The "extract to plan" action is the most ambitious link creation flow. It should
start conservative and explain what it changed.

For a selected recipe node, `Extract to new plan` can:

1. Derive target outputs from the selected node's outgoing solved product flows.
2. Create a new plan in the active session.
3. Add product targets to the new plan for those output rates.
4. Add or increase matching external inputs in the original destination plan.
5. Create session links from the new plan target outputs to the original plan
   inputs.
6. Re-solve both plans.
7. Warn if the original plan still chooses to make the same item locally.

`Send to existing plan` can follow the same shape, but add targets and links to
an existing selected source plan.

Hard cases to handle explicitly:

- Recipe nodes with multiple products or important byproducts.
- Recipe loops and self-flows.
- Power generator nodes that represent energy production rather than item
  production.
- Nodes whose output is also requested as a final target.
- Existing target-output sink reservations for the same item.
- Original plans that still produce the item after external input is added.

The first version does not need to perfectly remove every local production path.
It can create the split, re-solve, and surface any remaining local production as
something the user can address through recipe, input, or target settings.

## Suggested Sequence

1. Add browser smoke coverage for the planner basics before introducing more
   stateful cross-plan behavior.
2. Build the selected-node action tray with existing safe actions: done, note,
   focus path, open workbench, and existing sink actions.
3. Add session link types, persistence migration, hydration, and pure derived
   balance selectors in `planner-core`.
4. Add manual link editing between a source output target and a destination
   external input, including partial amounts and warning states.
5. Extend links to source surplus/byproduct outputs once target-output links are
   stable.
6. Add graph and inspector affordances for creating links from selected output
   or external input nodes.
7. Add `Extract to new plan` for recipe nodes, starting with straightforward
   single-product nodes.
8. Add `Send to existing plan` and multi-output handling.
9. Add a schematic session overview after users can create meaningful links.
10. Add logistics route tracking after manual links have proven the contract,
    following [Logistics Route Planning](./logistics-route-planning.md).

## Open Questions

- Should destination inputs remain item-based, or should `itemInputs` become a
  list with stable input IDs before links are implemented?
- Should link creation automatically increase a destination input, or ask first?
- Should target-output sinks and linked exports share one generalized output
  reservation model?
- Should links reserve output before sinks, after sinks, or only report
  overcommit without choosing a priority?
- Should logistics-backed links attach directly to a route, or to one
  route allocation among many loads and unloads?
- What is the smallest useful session balance view before a full session graph?
- Should extracting a recipe node also disable that recipe in the original plan
  when doing so is valid, or should it leave that decision to the user?
- How should linked plans behave when exported as standalone JSON files?
