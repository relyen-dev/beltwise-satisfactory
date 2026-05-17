# Data Model

The app consumes a compact `GameDataset`:

- `items`: planner-relevant item descriptors.
- `recipes`: automated recipes with ingredients, products, duration, alternate flag, and machine IDs.
- `machines`: production machine metadata.
- `resources`: raw resource descriptors and optional extraction caps.
- `schematics`: reserved for unlock/grouping metadata.

Raw docs fields such as Unreal object references are normalized to stable class IDs like `Desc_IronPlate_C`, `Recipe_IronPlate_C`, and `Build_ConstructorMk1_C`.

User projects persist configuration, not solver output:

- production targets
- recipe overrides
- machine overrides
- resource caps
- item inputs supplied externally
- objective profile
- graph display settings
- manual graph node positions
- plan/node lock state
- graph node done flags and notes

On load, the solver reruns from the stored project and generated dataset.

Individual plans can be exported as readable Beltwise JSON files with `kind:
beltwise.plan` and `formatVersion: 1`. A plan export contains one persisted
project payload plus dataset metadata for mismatch warnings. It does not include
global user defaults, whole-session state, save-game data, share links, or solver
output. Imported plans are added as separate local projects and are solved again
with the current app dataset.

Plan sharing uses a separate compact `bw.p` payload. It stores deltas against
Beltwise's schema-defined defaults for the current dataset, then compresses that
payload for `#plan=` links or copy/paste codes. Missing compact fields never
resolve from the importing user's defaults.
