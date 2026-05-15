# RFC: Graph Layout And Interaction

Status: Future iteration

## Summary

Beltwise already has the essential pieces for graph visualization: solver output, graph model, and an interactive renderer. The next graph work should focus on making default layouts readable enough for large production plans while still allowing manual adjustment.

This is not the immediate layout/workspace priority. Keep this RFC as a backlog for graph-specific improvements.

## Goals

- Produce a good-enough automatic left-to-right layout.
- Keep factory flow readable as plans grow.
- Allow users to drag nodes into a preferred arrangement.
- Make edges informative with item names and per-minute values.
- Avoid trying to make the auto-layout perfect for every plan.

## Non-Goals

- Do not block the MVP on perfect graph layouts.
- Do not require manual layout before a plan is useful.
- Do not persist renderer-specific graph objects.
- Do not make graph layout logic depend on the Angular/Foblex implementation.

## Desired Default Layout

The default graph layout should attempt:

- Raw resources on the left.
- Intermediate recipes in the middle.
- Requested outputs on the right.
- Left-to-right item flow wherever possible.
- Related branches spaced apart vertically.
- Shared intermediates positioned where they reduce obvious edge backtracking.
- Outputs aligned or grouped on the right when practical.
- Enough whitespace that labels and node content remain readable.

The rough target is a left-to-right flow with outputs on the right and related recipe chains separated into readable lanes.

## Manual Movement

Users can drag nodes, and manual positions should remain renderer-agnostic project state.

Future behavior:

- Continue preserving manual node positions across re-solves when node IDs are stable.
- Reset or partially reset layout when target/config changes introduce substantial graph changes.
- Provide `Reset layout` to discard manual positions.
- Expand the current layout lock into pinning or partial locks only if users ask for it.

## Edge Labels

Edges should show:

- Item name.
- Flow per minute.
- Optional belt/pipe transport counts when enabled.

Example:

```txt
Iron Ingot 120/min
Screw 60/min
```

The labels need tuning:

- Keep labels high contrast.
- Avoid label collisions where possible.
- Hide or simplify labels at far zoom levels if necessary.
- Show richer details on hover.

## Hover And Inspection

Mouse hover or selection could show:

- Full item name.
- Exact per-minute rate.
- Source and destination node.
- Belt/pipe utilization.
- Whether the flow is part of a requested output, surplus, or byproduct.

The right inspector can continue to hold detailed selected-node information.

## Future Flow Semantics

Some graph edges can carry useful domain meaning beyond item name and rate. This should stay a renderer/inspection concern, not a solver requirement.

Raw resources are generated as resource nodes because miners and extractors are outside the production plan. When a normally raw resource appears from an automated recipe, the graph could eventually distinguish the source role:

- Converter recipes produce converted raw resources from SAM-based conversion.
- Packager recipes can produce unpackaged liquids or gases from packaged items.
- Other machines producing raw resources are producing byproducts that should be reused, routed to surplus, or handled by a future sink/disposal concept.

These distinctions are only visual or explanatory. Products from converters, unpackaging, and byproduct-producing recipes should still be normal usable flows when they are part of the solved plan, unless the user picked that product as the explicit target output.

## Infeasible And Error States

When the solver cannot produce a valid plan, the graph area should not look blank or broken.

Future behavior:

- Replace or overlay the graph canvas with a clear solve-state panel when the result is `infeasible`, `unbounded`, or `error`.
- Explain the likely reason in planner terms, such as a resource cap being too low, a required recipe being disabled, or a required machine being unavailable.
- Keep the graph controls available enough that users can return to the workbench and change inputs.
- Show relevant constraints when known, for example `Iron Ore cap is 480/min but this plan needs at least 500/min with the current recipes`.
- Preserve the last good graph only if it is clearly labeled as stale; otherwise an infeasible state should replace the graph to avoid misleading the user.
- Add tests for resource caps, disabled recipes, and impossible targets once the solver result model exposes useful failure detail.

## Layout Tuning Ideas

Future experiments:

- Increase layer spacing and node spacing for large graphs.
- Force left/right ports for most edges.
- Use stable node ordering to reduce jumps between solves.
- Group outputs by target order.
- Group recipe nodes by nearest output or major branch.
- Use item junction/bus nodes only if shared intermediates make graphs too tangled.
- Experiment with edge routing modes to reduce fold-back lines.
- Allow multiple layout presets, such as `Compact`, `Readable`, and `Wide`.
- Evaluate ELK as a replacement layout engine if Dagre is not good enough for large plans.

## Persistence

Manual layout state should persist as renderer-agnostic graph layout data:

```ts
interface GraphLayoutState {
  nodePositions: Record<string, { x: number; y: number }>;
  pinnedNodeIds?: string[]; // future
  layoutVersion?: number; // future
}
```

Do not persist Foblex-specific objects.

## Open Questions

- How much graph complexity should the default layout try to handle before recommending manual arrangement?
- Should edge labels be always visible, zoom-dependent, or hover-first?
- Should output nodes preserve the user's target row order?
- Should shared intermediate items get their own item/junction nodes?
- Should manual layout positions survive recipe toggles and target changes, or only exact same graph node IDs?
