# 0006: Use Scarcity-Based Raw Resource Weights

Status: Accepted

## Context

Beltwise needs the solver to make reasonable recipe choices when multiple valid plans exist. Satisfactory has many alternate recipes, and some recipes trade abundant resources for scarcer resources.

For example, Iron Ore is much more abundant than Copper Ore on the default map. A purely machine-count or power-minimizing objective may pick plans that are mathematically valid but strategically wasteful.

The solver should use map scarcity as the default opinion. Stronger Beltwise-specific preferences can come later, after we have more solver tests and can compare output against known planner behavior.

## Decision

Use raw resource scarcity as the baseline cost:

```txt
scarcityCost = 1 / baselineMapLimitPerMinute
```

Then apply a configurable opinion multiplier:

```txt
effectiveRawCost =
  amountPerMinute
  * scarcityCost
  * defaultOpinionMultiplier
  * userMultiplier
```

Initial default opinion multipliers should be neutral for every finite raw resource:

| Resource | Item ID | Multiplier | Notes |
| --- | --- | ---: | --- |
| Iron Ore | `Desc_OreIron_C` | `1` | Baseline finite resource. |
| Limestone | `Desc_Stone_C` | `1` | The internal ID uses `Stone`; keep the game ID as-is. |
| Copper Ore | `Desc_OreCopper_C` | `1` | Scarcity comes from the map limit. |
| Coal | `Desc_Coal_C` | `1` | Scarcity comes from the map limit. |
| Crude Oil | `Desc_LiquidOil_C` | `1` | Scarcity comes from the map limit. |
| Nitrogen Gas | `Desc_NitrogenGas_C` | `1` | Scarcity comes from the map limit. |
| Caterium Ore | `Desc_OreGold_C` | `1` | The internal ID uses `Gold`; keep the game ID as-is. |
| Raw Quartz | `Desc_RawQuartz_C` | `1` | Scarcity comes from the map limit. |
| Sulfur | `Desc_Sulfur_C` | `1` | Scarcity comes from the map limit. |
| Bauxite | `Desc_OreBauxite_C` | `1` | Scarcity comes from the map limit. |
| Uranium | `Desc_OreUranium_C` | `1` | Scarcity comes from the map limit. |
| SAM | `Desc_SAM_C` | `1` | Scarcity comes from the map limit. |
| Water | `Desc_Water_C` | `0` | Effectively unlimited by default, but still cap-able by user choice. |

This means the initial effective resource weights are map-only scarcity weights. If weights are normalized for display with Iron Ore as `1`, the effective display value is:

```txt
displayWeight = ironOreBaselineLimitPerMinute / resourceBaselineLimitPerMinute
```

Water should display as `0` by default.

## Consequences

The solver can prefer abundant resources when two otherwise-similar plans are available, without adding extra Beltwise-specific opinions yet.

The objective remains explainable:

- Scarcity comes from baseline map limits.
- Default opinion multipliers are neutral data/config values.
- User multipliers can override Beltwise's defaults per project later.

Resource IDs must use the game's stable class IDs, even when they look odd. For example:

- Caterium Ore is `Desc_OreGold_C`.
- Limestone is `Desc_Stone_C`.
- Crude Oil is `Desc_LiquidOil_C`.

Future resource providers, such as save imports or randomized-node seeds, can recalculate scarcity from their own resource limits while reusing the same opinion multiplier layer.

## Future Work

- Add a user-facing resource preference/objective panel.
- Add presets such as `Balanced`, `Conserve rare resources`, `Low power`, and `Simple recipes`.
- Analyze full recipe/resource dependency pressure to refine defaults.
- Consider adding Beltwise-specific non-neutral opinion multipliers after comparing solver plans against known planner behavior and targeted recipe tests.
- Display effective resource costs in planner terms rather than raw coefficients.
- Add tests proving resource weighting changes recipe choice when alternatives are otherwise feasible.
