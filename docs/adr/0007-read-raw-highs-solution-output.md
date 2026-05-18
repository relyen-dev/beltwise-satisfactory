# 0007: Read Raw HiGHS Solution Output

Status: Accepted

## Context

Beltwise uses the `highs` JavaScript/WASM package as the production LP solver runtime.

The package's public `solve()` wrapper reads HiGHS solution values by calling `Highs_writeSolutionPretty` and parsing the human-readable text output. That pretty output truncates column values. A simple LP such as `3x = 10` returns `3.33333` for `x`, even though the objective value is printed with more precision.

That truncation is visible in Satisfactory plans when Beltwise displays four decimals. For example, a 900/min Plastic plan using Recycled Plastic should show a 900/min output edge, but a truncated Recycled Plastic recipe rate caused graph flows such as `899.9994/min`.

Changing HiGHS feasibility tolerances did not fix this, because the loss happened while extracting solution values from the wrapper, not during the solve itself.

## Decision

Patch the loaded `highs` wrapper source before executing it:

- Replace `Highs_writeSolutionPretty` with `Highs_writeSolution`.
- Replace the wrapper's pretty-output parser with a raw-solution parser.
- Apply the patch in both the Node test/build loader and the browser asset loader.
- Do not edit `node_modules`.

Keep this behavior isolated inside `HighsLinearSolverAdapter` so the rest of the solver package continues to use stable adapter interfaces and normal variable-name mapping.

## Consequences

Planner-visible rates now preserve enough solution precision for Beltwise's four-decimal display option. This fixes cases where mathematically clean Satisfactory rates were displayed as near misses.

The workaround depends on the current bundled shape of `highs/build/highs.js`, so the adapter fails loudly if the expected writer or parser signatures are not found. If a future `highs` release exposes raw solution values directly through its public API, replace this patch with that API.

Because this workaround depends on generated wrapper source, keep the `highs` package exact-pinned and treat upgrades as solver changes. Upgrade PRs must pass the wrapper patch canary plus the precision fixtures below before the pin is moved.

Solver precision issues should still become fixture tests. Current regression coverage includes:

- A direct LP proving `10 / 3` is not truncated to `3.33333`.
- A full-data 900/min Plastic plan proving the graph output edge displays `Plastic 900/min` at four decimals.
- Full-data late-game plans that guard against orphan resources and tiny split-route artifacts.

This is a solver-adapter precision fix, not display-only rounding. Prefer source-level solver or adapter fixes before adding presentation cleanup for future numerical artifacts.
