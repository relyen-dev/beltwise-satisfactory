# Graph Interaction Notes

Status: current implementation notes for future help/wiki copy.

This document captures the graph interactions that are easy to miss from the UI alone. It is not intended to be final user-facing prose; use it as source material when writing help content.

## Selection

- Click a graph node to select it.
- Selecting a node highlights the selected node, its directly connected nodes, and its directly connected edges.
- Unrelated nodes and edges dim while a node is selected.
- Clear selection with the graph toolbar `Clear selection` action, the selected-node inspector `Clear` action, or `Esc` when focus is not inside an editable control.
- Clicking an already-selected node deselects it after a short delay. The delay leaves room for double-click actions.

## Node Movement

- Drag a node body to move it.
- Manual node positions are stored as graph layout state and reused across re-solves when node IDs remain stable.
- `Reset layout` clears manual node positions.
- `Lock nodes` prevents node movement, but should not prevent graph selection, selected-node inspection, done toggles, notes, or selected output target editing.

Implementation note: Foblex listens for document-level `mousedown` and `touchstart` for drag preparation. Interactive controls inside graph nodes need to stop mouse and touch start/end events, not only pointer events, or locked-node mode can accidentally start a canvas drag.

## Done State And Notes

- Double-click a node to toggle its `Done` state.
- The selected-node inspector also exposes a `Done` checkbox.
- Done state and node notes are persisted in the project build state.
- Notes are edited and cleared from the selected-node inspector.
- Nodes with done or note state show small badges on the graph.
- The inspector overview lists visible node notes and stale node notes whose node is not currently in the solved graph; stale notes are preserved rather than deleted automatically.

## Output Target Editing

- Fixed output targets can be edited directly from the graph.
- Output nodes show the target rate as larger passive text by default, for example `2700 /min target`.
- Select an output node to reveal the inline target rate input.
- Editing the inline input updates the same persisted target amount used by the Plan workbench.
- Press `Enter` or blur the field to commit the value.
- Press `Escape` to reset the field to the current target amount without committing.
- The inline field accepts numeric text and clamps invalid/non-finite values to `0`.
- Committed changes trigger a normal re-solve; solver output is still derived state and is not persisted as authoritative project state.

## Lock Behavior

- `Lock plan` prevents solve-relevant configuration edits.
- When the plan is locked, selected output nodes should remain display-only and should not expose the inline target rate input.
- `Lock nodes` only prevents graph node movement.
- When nodes are locked, selected fixed output nodes should still expose and commit the inline target rate input.

## Current Limitations

- Only fixed output target rates are editable from the graph.
- Maximize targets are display-only on the graph because their rates are solver results rather than user-entered amounts.
- Other node types are not editable from the graph yet.
- Output item selection, target mode changes, target duplication, and target removal still live in the Plan workbench.
- The selected and unselected output node layouts are not visually identical today because the selected state swaps passive rate text for an input.
