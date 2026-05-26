# RFC: Sinks, Disposal, And Power Targets

Status: Partially implemented, remaining backlog

## Summary

Beltwise now supports the first steps of AWESOME Sink and power planning: users can route currently sinkable surplus, reserve some or all sinkable target outputs for sinking, and add explicit generator/fuel power targets. This RFC captures the remaining related ideas so future work can extend the model deliberately instead of making sink routing or power planning secretly mutate the factory.

The core distinction is:

- Sink rules route material the plan already produces as surplus or requested output.
- Disposal rules may ask the solver to transform surplus into a sinkable form.
- Power targets ask the solver to operate specific generator/fuel pairs, which often creates fuel, waste, and byproduct handling requirements.

Those should stay separate in the plan model and UI.

## Current Behavior

Implemented direct surplus sinks:

- A plan can store surplus sink rules by item.
- The graph renders a sink node for sinkable surplus with an active sink rule.
- The Sinks workbench menu only offers currently available sinkable surplus from the active solve result.
- Sink rows show the solved rate and sink points per minute when sink point data exists.
- Solver output remains derived state; plans persist only the user's sink intent.

Implemented target-output sinks:

- A plan can store amount-based target-output sink rules by item.
- The Sinks workbench menu offers sinkable solid target outputs with remaining unsunk target amount.
- Target-output sink amounts are clamped to the solved or configured target output rate.
- The graph keeps the output target node visible and routes the sunk allocation from that output node to an AWESOME Sink node.
- The inspector and reports show the requested/solved target amount separately from the amount reserved for sinking.

Implemented explicit power targets:

- A plan can store power targets alongside product targets.
- Each power target selects a generator, a fuel, and either generator count or MW mode.
- The solver adds generator operation as plan demand, including fuel use, supplemental inputs such as water, byproducts, waste, and generated MW.
- The graph renders power nodes, assumed input nodes when an input is not solved locally, and loopback badges for recipe self-flows.

Current boundary:

- The sink rule does not create recipes.
- The sink rule does not package fluids.
- Target-output sink rules only allocate solved/requested target outputs; they do not increase production by themselves.
- The sink rule does not add supporting production such as plastic canisters.
- Target-output sink options are limited to sinkable solids for now.
- Power targets require an explicit generator/fuel choice and do not yet let the solver choose or mix fuels.
- Maximize-power objectives are not implemented yet.
- Nuclear waste can appear as a byproduct or assumed-input dependency, but specialized nuclear waste handling choices remain future work.

## Design Principles

- Keep direct sink routing simple and honest.
- Do not let a sink checkbox add hidden factory work.
- Make conversion-to-sink an explicit user choice.
- Treat waste handling as production intent, not display-only decoration.
- Prefer plan-level behavior first, then grow to session-level sinks once linked factories exist.
- Keep sink and power behavior behind planner-core and solver capabilities rather than Angular components.

## Direct Sink Rules

Direct sink rules are the current model.

Behavior:

- User selects a sinkable surplus item that exists in the active solve result.
- Beltwise routes that surplus to an AWESOME Sink node.
- The solver does not change the production plan.
- If the surplus disappears after plan edits, the rule can remain configured but the graph should not show an active sink rate.

Useful follow-up polish:

- Show configured sink rules with zero current surplus as inactive.
- Explain why no surplus is available in the Sinks panel.
- Let selected byproduct nodes expose a small action drawer with sink, done, notes, and future plan actions.
- Keep the inspector action and Sinks panel action in sync.

## Target Output Sinks

Target-output sinks are implemented as plan-level sink rules. They are useful when a player is producing an output before another factory is ready to consume it, or when the output is intentionally destined for coupons.

Current behavior:

- A fixed target can reserve part or all of its output for sinking.
- A maximize target can reserve part of the solved output when a solved amount is available.
- Multiple targets for the same item allocate sink amounts in target sort order.
- The graph shows the output target and then routes the sunk allocation to an AWESOME Sink node.
- The target remains a requested output; Beltwise reports the sunk amount separately instead of rewriting the target rate to zero.

Remaining questions:

- Should target sinking also be editable directly on the target row, or should the Sinks panel remain the only add/edit surface for now?
- Should the UI add an `all remaining target output` mode, or keep the current amount-based rule only?
- How should target-output sink allocations interact with future linked-plan exports, local-use reservations, and session balance?
- Should target-output sink allocations and linked-plan exports eventually share one output reservation model, or remain separate rules with shared overcommit warnings?

## Conversion-To-Sink

Some surplus is not directly sinkable, but can become sinkable through additional recipes. A common example is surplus Fuel: liquid Fuel cannot be sunk directly, but Packaged Fuel can be sunk after packaging.

This should be an explicit future capability, not part of direct sink rules.

Possible behavior:

- User sees unsinkable surplus with known sinkable conversion paths.
- User chooses a `make sinkable` or `convert for sinking` action.
- Beltwise creates disposal intent that allows specific conversion recipes.
- The solver may add supporting production only when the user has allowed it.
- Reports distinguish original surplus, conversion inputs, generated sinkable output, and sink points.

Important constraints:

- Extra raw inputs should be opt-in.
- Consuming existing target outputs should be opt-in.
- Packaging fluids should expose container requirements.
- Returned empty containers, recycled loops, and byproducts need normal surplus handling.
- The UI must make clear that this changes the factory, unlike direct sink routing.

Potential disposal intent shape:

```txt
source surplus: Fuel
sinkable output: Packaged Fuel
allowed conversion: Packaged Fuel recipe
allow extra inputs: false by default
allow consuming target outputs: false by default
```

## Nuclear Waste Handling

Nuclear planning needs waste byproducts even when the user does not want to pursue the full chain.

Relevant chain:

- Uranium Fuel Rods can create Uranium Waste.
- Uranium Waste can become Plutonium Fuel Rods.
- Plutonium Fuel Rods can create Plutonium Waste if burned.
- Plutonium Waste can become Ficsonium in late-game handling.

Needed capabilities:

- Allow unsinkable and hazardous waste surplus to remain visible and intentional.
- Let users stop at a selected waste handling level.
- Let users allow or disallow downstream waste conversion.
- Distinguish storing waste from consuming it in a follow-up chain.
- Keep nuclear chain choices explicit because "solve it all" may be too expensive or undesired.

Open questions:

- Should waste handling be a special nuclear panel, a Sinks/Disposal panel mode, or normal targets plus warnings?
- Should the solver prefer no permanent waste when possible, or only when the user selects that objective?
- How should Ficsonium handling be represented when it is production, disposal, and power-related at the same time?

## Power Targets

Power planning now has a first explicit-target pass. Users can target generators or MW output with a selected generator and fuel. The next step is solver-selected fuel planning and richer waste/disposal choices.

Supported user goals:

- Build 16 Coal Generators.
- Build 80 Fuel Generators.
- Produce at least 10,000 MW.

Future user goals:

- Maximize power under a resource cap such as 900 crude oil per minute.
- Compare fuel choices, such as Fuel versus Turbofuel versus Rocket Fuel.

Current model:

- Power targets are first-class plan intent, separate from item targets.
- Generator fuel options come from generated data.
- The solver uses a linear generator variable for each configured power target.
- Generator count, generated power, fuel demand, supplemental inputs, byproducts, and waste are included in graph/report data.

Future model direction:

- Let users choose a specific fuel or allow the solver to choose among enabled fuels.
- Allow maximize-power objectives under resource, machine, recipe, and waste constraints.
- Allow mixed fuel routes when multiple fuels are enabled and the objective supports it.
- Keep generator overclocking linear if it is added later: generator power output and resource consumption scale directly with clock rate.

Fuel selection:

- Manual mode: user selects a generator and fuel type. This is implemented.
- Allowed set mode: user enables several fuels and the solver chooses. This is future work.
- Maximize mode: solver can mix fuel routes when that is optimal under caps. This is future work.

This is where a cap such as 900 crude oil can lead to mixed output: part of the plan may use one fuel chain and the remainder another if the objective and allowed recipes make that optimal.

## UI Direction

Current Sinks panel:

- Show configured direct sink rules.
- Add direct sinkable surplus from the active plan.
- Add amount-based target-output sinks from sinkable solid output targets.
- Show sink points per minute.
- Show inactive or clamped configured rules when the current solved amount is zero or below the configured amount.

Future Disposal panel or Sinks panel expansion:

- Show direct sinkable surplus.
- Show unsinkable surplus with possible conversion actions.
- Show nuclear waste handling choices.
- Keep direct routing, conversion, and waste handling visually distinct.

Node action drawer idea:

- Selected graph nodes could reveal a compact drawer of action icons.
- Initial actions might include sink surplus, mark done, and note.
- Future actions could include move node to its own plan, create linked export, focus path, or open disposal conversion.
- The drawer should complement the inspector, not replace it.
- Link and extraction actions should follow the [linked-plan contract RFC](./linked-plan-contracts.md) so the graph surface does not own session domain state.

## Suggested Sequence

1. Polish direct sink rules with inactive configured states and clearer empty explanations.
2. Refine target-output sink UX around target rows, clamped amounts, and future export/local-use reservations.
3. Add power-target polish for fuel option filtering, warnings, and high-scale nuclear/fuel readability.
4. Write solver tests for disposal conversions before adding UI.
5. Prototype explicit conversion-to-sink for one packaged fluid path.
6. Design nuclear waste handling as a focused solver and UI capability.
7. Add solver-selected fuel sets and maximize-power planning after manual generator/fuel targets are stable.
8. Integrate session-level sink destinations once linked plans exist.
