# RFC: Sinks, Disposal, And Power Targets

Status: Draft backlog

## Summary

Beltwise now supports the first step of AWESOME Sink planning: users can mark currently sinkable surplus from the active plan and route that surplus to sink nodes. This RFC captures the next related ideas so future work can extend the model deliberately instead of making surplus routing secretly mutate the factory.

The core distinction is:

- Sink rules route material the plan already produces as surplus.
- Disposal rules may ask the solver to transform surplus into a sinkable form.
- Power targets ask the solver to produce electricity, which often creates fuel, waste, and byproduct handling requirements.

Those should stay separate in the plan model and UI.

## Current Behavior

Implemented direct surplus sinks:

- A plan can store surplus sink rules by item.
- The graph renders a sink node for sinkable surplus with an active sink rule.
- The Sinks workbench menu only offers currently available sinkable surplus from the active solve result.
- Sink rows show the solved rate and sink points per minute when sink point data exists.
- Solver output remains derived state; plans persist only the user's sink intent.

Current boundary:

- The sink rule does not create recipes.
- The sink rule does not package fluids.
- The sink rule does not consume target outputs.
- The sink rule does not add supporting production such as plastic canisters.

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

Users may eventually want to sink output they are not using yet, especially before linked factories exist.

Possible behavior:

- A target output can reserve some amount as exported, used locally, or sunk.
- A plan can intentionally sink all or part of a fixed target output.
- A maximize target can report the solved output and optionally route unreserved output to a sink.
- Sunk target output should be included in plan reports and future session balance.

Open questions:

- Should target sinking live on the target row, in the Sinks panel, or both?
- Should target output sinks be amount-based, all-surplus, or both?
- Should the graph show a separate sink node per target or merge by item?
- How should this interact with future linked-plan exports?

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

Power planning should eventually let users target generators or power output instead of only item outputs.

Possible user goals:

- Build 16 Coal Generators.
- Build 80 Fuel Generators.
- Produce at least 10,000 MW.
- Maximize power under a resource cap such as 900 crude oil per minute.
- Compare fuel choices, such as Fuel versus Turbofuel versus Rocket Fuel.

Model direction:

- Add power targets as first-class plan intent, separate from item targets.
- Represent generator recipes or generator operating modes in solver input.
- Let users choose a specific fuel or allow the solver to choose among enabled fuels.
- Allow maximize-power objectives under resource, machine, recipe, and waste constraints.
- Include generator count, power output, fuel demand, byproducts, and waste in reports.

Fuel selection:

- Manual mode: user selects a generator and fuel type.
- Allowed set mode: user enables several fuels and the solver chooses.
- Maximize mode: solver can mix fuel routes when that is optimal under caps.

This is where a cap such as 900 crude oil can lead to mixed output: part of the plan may use one fuel chain and the remainder another if the objective and allowed recipes make that optimal.

## UI Direction

Near-term Sinks panel:

- Show configured direct sink rules.
- Add direct sinkable surplus from the active plan.
- Show sink points per minute.
- Show inactive configured rules when current surplus is zero.

Future Disposal panel or Sinks panel expansion:

- Show direct sinkable surplus.
- Show unsinkable surplus with possible conversion actions.
- Show target output sinking controls.
- Show nuclear waste handling choices.
- Keep direct routing, conversion, and waste handling visually distinct.

Node action drawer idea:

- Selected graph nodes could reveal a compact drawer of action icons.
- Initial actions might include sink surplus, mark done, and note.
- Future actions could include move node to its own plan, create linked export, focus path, or open disposal conversion.
- The drawer should complement the inspector, not replace it.

## Suggested Sequence

1. Polish direct sink rules with inactive configured states and clearer empty explanations.
2. Add target output sinking only after the target/link model is ready enough to avoid rework.
3. Write solver tests for disposal conversions before adding UI.
4. Prototype explicit conversion-to-sink for one packaged fluid path.
5. Design nuclear waste handling as a focused solver and UI capability.
6. Add power target planning after generator fuel data and byproduct handling are modeled cleanly.
7. Integrate session-level sink destinations once linked plans exist.

