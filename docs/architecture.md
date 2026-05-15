# Architecture

Beltwise is split into framework-independent domain packages plus one Angular shell.

- `packages/game-data` owns generated data schemas, tuple parsing, raw docs normalization, stable JSON output, and the fixture dataset.
- `packages/planner-core` owns saved project state, resource limit contracts, solver result shapes, renderer-neutral graph models, graph display settings, and layout preservation.
- `packages/solver` owns the pure LP model builder and solver adapters. Angular does not assemble LP coefficients.
- `apps/web` owns UI state orchestration, local persistence, controls, and the Foblex Flow adapter/component layer.

Renderer-specific types stay in `apps/web/src/features/graph`. Persisted projects and `planner-core` graph models are renderer-neutral.

The generated data pipeline is build-time only. Raw `en-US.json` is read by `scripts/extract-satisfactory-data` and normalized into `apps/web/public/data/satisfactory-current.json`, which is what the Angular app serves.

The production solver uses a continuous LP model solved by HiGHS through `packages/solver`. The model builder, lexicographic objective stages, HiGHS adapter, and solution-to-plan mapping stay framework-independent so Angular can treat solving as an application service dependency.

Default graph positions are generated from renderer-neutral graph data before the Foblex adapter maps that data into Angular/Foblex view models. The current layout implementation uses Dagre; that can be replaced without changing persisted project shape or solver output.

Solver output is not persisted as authoritative state. Plans persist targets, recipe/machine/resource/input configuration, graph display settings, build-state notes, and manual node positions, then rerun the solver when loaded.

HiGHS is loaded through the `highs` JavaScript/WASM package, but Beltwise patches the loaded wrapper to read raw solution output rather than the wrapper's truncated pretty output. See [ADR 0007](./adr/0007-read-raw-highs-solution-output.md).
