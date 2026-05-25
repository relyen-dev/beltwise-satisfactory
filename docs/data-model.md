# Data Model

The app consumes a compact `GameDataset`:

- `items`: planner-relevant item descriptors.
- `recipes`: automated recipes with ingredients, products, duration, alternate flag, availability category, and machine IDs.
- `machines`: production machine metadata.
- `generatorFuelOptions`: generator/fuel pairs with fuel demand, generated MW, supplemental inputs, and byproducts.
- `resources`: raw resource descriptors and optional extraction caps.
- `schematics`: reserved for unlock/grouping metadata.

Raw docs fields such as Unreal object references are normalized to stable class IDs like `Desc_IronPlate_C`, `Recipe_IronPlate_C`, and `Build_ConstructorMk1_C`.

Recipe availability is grouped as `standard`, `unlock`, `converter`, or
`alternate`. Standard and deterministic unlock recipes are enabled by default in
new plans. Converter and alternate recipes are disabled by default so users opt
into raw-resource conversions and hard-drive alternates separately.

User projects persist configuration, not solver output:

- production targets
- power targets
- sink rules for surplus and target outputs
- recipe overrides
- machine overrides
- resource caps
- item inputs supplied externally
- plain-text plan notes
- objective profile, including preset/strategy/order and custom weights
- graph display settings
- manual graph node positions
- plan/node lock state
- graph node done flags and plain-text notes

On load, the solver reruns from the stored project and generated dataset.

Local workspace state is versioned separately from individual plan exports. The
current workspace schema stores:

- `sessions`: game-session records that group plan/project IDs.
- `activeSessionId`: the selected session.
- `projects`: standalone plan/project records.
- `activeProjectId`: the selected plan within the active session.
- `userDefaults`: global defaults for newly created plans.

A `PlannerSession` represents a Satisfactory world/save context. It currently
stores `id`, `name`, `datasetId`, `createdAt`, `updatedAt`, `projectIds`, and
an optional `activeProjectId`. Sessions reference project IDs instead of
embedding project records, so plans remain portable and can still be imported,
exported, duplicated, and solved independently.

Existing v1/v2 local workspaces migrate into one `Default session` that contains
all existing projects and preserves the active project when possible. Hydration
filters stale session project references and falls back to a valid session plan
when saved IDs no longer exist.

Sessions currently group plans only. Session defaults, save metadata, linked
plans, logistics routes, map pins/locations, session-wide production balance,
and session import/export are future extensions.

Individual plans can be exported as readable Beltwise JSON files with `kind:
beltwise.plan` and `formatVersion: 1`. A plan export contains one persisted
project payload plus dataset metadata for mismatch warnings, including product
targets, power targets, sink rules, recipe/machine/resource settings, external
inputs, objective settings, graph display/layout, notes, and build state. It
does not include global user defaults, whole-session state, save-game data,
share links, or solver output. Imported plans are added as separate local
projects in the active session and are solved again with the current app dataset.

Plan sharing uses a separate compact `bw.p` payload. It stores deltas against
Beltwise's schema-defined defaults for the current dataset, then compresses that
payload for `#plan=` links or copy/paste codes. Missing compact fields never
resolve from the importing user's defaults. Plan notes and node notes are
included when non-empty; power targets and sink rules round-trip with the same
user-intent-only rule as product targets. Session notes, logistics route notes,
and map/location notes are not part of the current plan payload.

Sink rules are allocation intent, not production intent. A surplus sink rule
routes currently solved sinkable surplus to an AWESOME Sink when that surplus is
present. A target-output sink rule reserves a configured amount of a sinkable
solid output target for sinking and clamps that amount to the solved/target
output rate. Neither rule adds recipes, packages fluids, or changes the solved
production amount.

Power targets are explicit generator/fuel targets. A target stores generator,
fuel, mode (`generator-count` or `power`), and amount. The solver turns that
intent into generator operation, fuel demand, supplemental inputs, byproducts,
and generated-power reporting, but the derived usage remains solver output and
is not persisted as authoritative state.
