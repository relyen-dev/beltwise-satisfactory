# RFC: Workbench UX Polish

Status: Partially implemented, remaining polish backlog

## Summary

Beltwise's workbench panels cover the core planning controls and now use more visual, icon-backed row states for several high-traffic panels. This RFC captures remaining visual and interaction polish ideas so future work can stay focused on behavior, correctness, and readability.

## Recipe Panel Polish

Current direction:

- Base recipes and alternate recipes are separate sections.
- Base recipes include standard recipes, deterministic unlock recipes, and converter recipes as smaller subgroups.
- Standard and deterministic unlock recipes are enabled by default.
- Converter recipes are disabled by default because they intentionally convert raw resources.
- Alternate recipes are disabled by default per project.
- Recipe rows are clickable semantic controls with visible enabled/disabled treatment.
- Recipe rows and tooltips can show item icons when matching files exist in `public/game-icons`.

Remaining polish ideas:

- Continue tuning enabled row accents so they are obvious without becoming visual noise.
- Add compact recipe summaries later:
  - ingredient chips
  - output chips
  - machine chip
  - duration/cycles per minute
- Keep standard, unlock, converter, and alternate recipe sections visually distinct without copying another planner's visual treatment.
- Add saved filters/views for late-game users, such as `Unlocks only`, `All alternates`, `Base only`, and `Used in current plan`.

## Resource Panel Polish

Current direction:

- Resource limits are per-project solver inputs.
- The default resource values should come from the static baseline map limits.
- Users should be able to override limits for individual raw resources.
- Users should be able to disable a raw resource entirely for a plan.
- Resource rows show custom/disabled state and support bulk enable/disable/reset actions.

Remaining polish ideas:

- Use a scan-friendly multi-column layout once the full raw resource list is present.
- Keep each resource row compact: resource name, enabled toggle, per-minute cap, and reset action.
- Prefer a single-column resource list when rows include explanatory subtext such as map limit and effective limit. Two columns only work if the row content is short enough that labels, metadata, inputs, and actions never collide.
- Consider toggle switches instead of checkboxes for resource availability if they remain readable in dense rows.
- Highlight enabled resource rows subtly, reserving stronger amber for focused controls and changed values.
- Show changed/custom resource caps with a small `custom` indicator and an easy `reset` action.
- Provide bulk actions such as `Set from map limits`, `Disable all`, and `Reset changed`.
- Treat water as effectively unlimited by default, but still allow users to set a finite cap or disable it so they can force alternate solver paths.
- Keep the UI clear that disabling a resource means the solver may still find alternate recipes or may become infeasible.
- Later, support resource presets such as `Full map`, `Custom`, `Biome`, `Uploaded save`, or `Seed`, behind the resource provider model.

Possible row presentation:

```txt
[enabled] Iron Ore      92100 / min      reset
[off]     Coal          0 / min          reset
[custom]  Water         600 / min        reset
```

## Save-Aware Recipe Setup

Future save-file import could preconfigure unlocked alternate recipes.

Potential flow:

1. User uploads a save file locally.
2. Beltwise reads unlocked alternate recipes.
3. Project recipe overrides are initialized from that save.
4. User can still manually adjust recipe toggles after import.

This belongs with the future save/resource-provider work and should not be part of the MVP.

## Workbench Panel Width

Different panels may need different widths:

- Plan: medium-wide.
- Inputs: medium.
- Resources: medium-wide.
- Recipes: wide.
- Machines: medium-wide.
- Display: medium.

The workbench should remain flexible enough to let dense table tasks use more horizontal room.
