# RFC: Beltwise Assistant And Automation Tooling

Status: Optional future integration

## Summary

Build Beltwise tooling that exposes Satisfactory production data and lightweight planning functions to assistant clients, bots, and automation clients.

MCP is one possible transport, not the core requirement. The core requirement is a structured, reliable API/tool surface that lets external clients ask Beltwise for accurate game/planner facts instead of scraping or guessing.

The goal is not to replace the Beltwise web app. The goal is to make Beltwise's generated dataset and solver accessible to assistants and bots so they can answer questions like:

- "What does it take to make 60 reinforced iron plates per minute?"
- "What recipes can produce screws?"
- "Which alternate recipes consume copper?"
- "Draft a simple early-game rotor factory."
- "Why is this production plan infeasible?"

General-purpose assistants often know Satisfactory poorly or mix versions together. Beltwise tooling could give them accurate, versioned, planner-backed knowledge.

## Context

MCP servers can expose:

- Resources: readable context/data.
- Tools: callable actions with structured inputs/outputs.
- Prompt templates: reusable workflows/templates.

Official MCP SDKs exist for TypeScript, Python, C#, Go, Java, and Rust. TypeScript is a natural fit because Beltwise's extractor, generated dataset schema, and planner packages are already implemented in TypeScript.

This should remain separate from the MVP web app. It can reuse the generated planner dataset and solver packages.

Possible tool surfaces:

- Local MCP server over stdio.
- Local HTTP service for bots or local LLM runtimes.
- Hosted API later, if we intentionally choose to run one.
- CLI commands that bots can call.
- Twitch/YouTube/chat bot integration that wraps one of the above.

## Goals

- Give assistant clients accurate Satisfactory item, recipe, machine, and resource information.
- Let external clients request small production-plan solves without scraping the web or guessing.
- Reuse Beltwise's build-time generated dataset.
- Reuse Beltwise's solver adapter/model builder where practical.
- Keep all responses versioned by dataset/game version.
- Support local-first usage without accounts or hosted services.
- Leave room for stream/chat integrations that answer viewer commands.

## Non-Goals

- Do not make assistant/tooling integrations required for the Beltwise web app.
- Do not expose user projects/plans unless the user explicitly points the server at local project storage later.
- Do not parse `.sav` files in the MCP server initially.
- Do not make this an always-on public API in the first version.
- Do not rely on the LLM to solve production math when the solver can do it deterministically.

## Proposed Package

```txt
packages/
  assistant-tools/
    src/
      index.ts
      server.ts
      transports/
      resources.ts
      tools.ts
      workflows.ts
      datasetLoader.ts
      formatters.ts
    test/
```

The tooling package should depend on:

- `packages/game-data`
- `packages/planner-core`
- `packages/solver`
- generated dataset JSON

It should not depend on the Angular app.

If MCP is the first transport, the package can expose an MCP server. If a stream bot or local HTTP service comes first, keep the same core tool functions and wrap them with a different transport.

## MCP Resources

Possible resources:

- `beltwise://dataset/metadata`
  - Dataset id, game version, generated date, source fingerprint.
- `beltwise://items`
  - Compact item list.
- `beltwise://items/{itemId}`
  - Item detail, icon reference, form, resource info.
- `beltwise://recipes`
  - Compact recipe list.
- `beltwise://recipes/{recipeId}`
  - Recipe detail, ingredients, products, duration, machines, alternate flag.
- `beltwise://machines`
  - Machine list and power/speed metadata.
- `beltwise://resources/baseline`
  - Baseline resource limits when available.

Resources should be compact and structured. Avoid returning the entire generated dataset unless explicitly requested and reasonably sized.

If using a non-MCP transport, these resources map naturally to read-only HTTP endpoints or CLI commands.

## MCP Tools

Possible tools:

```ts
get_item_info(itemIdOrName)
```

Returns item metadata and related recipes.

```ts
search_items(query)
```

Finds items by display name, class name, or aliases.

```ts
get_recipe_info(recipeIdOrName)
```

Returns recipe ingredients/products per cycle and per minute, duration, machine compatibility, and alternate/base status.

```ts
find_recipes_for_item(itemIdOrName, direction)
```

Finds recipes that produce or consume an item.

```ts
solve_plan(targets, options)
```

Runs the Beltwise solver for one or more requested outputs.

Inputs:

- targets: item/mode/amount per minute.
- enabled recipe overrides.
- resource caps.
- item inputs.
- objective profile.

Output:

- status.
- raw inputs.
- recipe rates.
- machine usage.
- power.
- surplus/byproducts.
- short human-readable explanation.

```ts
explain_infeasible_plan(targets, options)
```

Attempts to explain why a solve failed using solver warnings and missing resource/recipe/machine constraints.

```ts
compare_recipes(itemIdOrName, recipeIds?)
```

Compares candidate recipes that produce a given item.

## Reusable Workflows

Possible reusable workflow templates:

- `draft_factory_plan`
  - "Create a simple factory plan for these outputs using the available recipes and explain the main raw inputs."
- `explain_recipe_tradeoffs`
  - "Compare alternate recipes for this item and explain the resource/power/machine tradeoffs."
- `debug_infeasible_plan`
  - "Help debug why this production plan cannot be solved."
- `early_game_plan`
  - "Suggest a low-complexity early-game plan using only base recipes."

Workflow templates should call tools/resources rather than embedding stale Satisfactory facts.

If using a stream bot or local HTTP tool surface, response templates may live in the bot or assistant integration rather than the Beltwise package. The important part is that any generated answer is grounded in tool results, not memory.

## Stream Bot Scenario

A future stream bot could expose chat commands such as:

```txt
!item reinforced iron plate
!recipe rotor
!plan 10 reinforced iron plate
!alts screw
!beltwise rotor 5
```

Possible flow:

1. Viewer sends a command.
2. Stream bot parses the command.
3. Bot calls a local Beltwise tool service or MCP server.
4. Beltwise returns structured item/recipe/plan data.
5. A deterministic formatter or optional assistant client formats a short chat-friendly answer.
6. Bot replies in chat with a summary and optional Beltwise share link.

Example chat response:

```txt
Rotor 5/min needs 20 iron rods/min and 100 screws/min with base recipes.
Approx machines: 1.33 assemblers, 3.33 constructors for screws, 1.33 constructors for rods.
Open plan: https://satisfactory.beltwise.app/?plan=...
```

This is useful even without generated prose for basic lookups. An assistant client mainly helps make responses friendly, short, and contextual.

## Share Links And Plan Tokens

Beltwise supports compact `bw.p` plan payloads for copy/paste codes and `#plan=` links. Assistant/tooling integrations should use the same plan-share format for suggested plans instead of inventing a second token shape.

Current approach:

- Store user projects locally as versioned JSON.
- Define a smaller `SharePlan` format containing only portable user intent/configuration:
  - dataset id/version
  - targets
  - recipe overrides
  - resource caps
  - item inputs
  - objective profile
  - graph display settings
  - non-empty plan and node notes
- Serialize to compact JSON.
- Compress with a browser-safe algorithm.
- Encode in a URL-safe token.
- Put the token in the URL hash as `#plan=`.

Example:

```txt
https://satisfactory.beltwise.app/#plan=<compressed-token>
```

The share token must not contain authoritative solver output. The site decodes the token and solves locally using the current compatible dataset.

Open questions:

- How large do multi-output plans get as URL tokens?
- Should large plans use copy/paste JSON export instead of URL tokens?
- How should Beltwise handle a shared plan created against an older dataset version?

## External Reference Links

For item or recipe lookup responses, Beltwise tooling could include optional external reference links.

Possible examples:

- Official/community wiki page on `satisfactory.wiki.gg`.
- Beltwise item detail page, if the app later adds one.
- Beltwise generated plan link for a requested output.

These links should be treated as convenience references, not as authoritative data inputs. Beltwise should still answer from its own versioned generated dataset.

Future questions:

- Can item display names be mapped reliably to `wiki.gg` slugs?
- Should the generated dataset include optional `externalLinks` fields?
- Should stream bot responses include links by default, or only when requested?
- How should links handle renamed items or wiki URL changes?

## Example Tool Request

```json
{
  "targets": [
    { "item": "Reinforced Iron Plate", "mode": "fixed", "amountPerMinute": 10 },
    { "item": "Rotor", "mode": "fixed", "amountPerMinute": 5 }
  ],
  "options": {
    "recipePolicy": "baseOnly",
    "resourceCaps": {
      "Desc_OreIron_C": 240
    }
  }
}
```

Example response shape:

```json
{
  "status": "optimal",
  "datasetId": "satisfactory-1.2-489969",
  "rawInputs": [
    { "itemId": "Desc_OreIron_C", "amountPerMinute": 180 }
  ],
  "machineUsage": [
    { "machineId": "Build_SmelterMk1_C", "count": 6 },
    { "machineId": "Build_ConstructorMk1_C", "count": 8 },
    { "machineId": "Build_AssemblerMk1_C", "count": 3 }
  ],
  "summary": "This plan is feasible with 180 iron ore/min and base recipes only."
}
```

## Architecture

```txt
generated dataset
        |
 dataset loader
        |
 planner-core + solver
        |
 resources/tools/workflows
        |
 local LLM client
```

The tooling service should be read-only by default. It can expose deterministic computations, but it should not mutate local Beltwise projects unless a future version explicitly adds project tools with clear confirmation boundaries.

## Security And Privacy

- Prefer local-only transport for first experiments, such as MCP stdio, localhost HTTP, or CLI commands.
- Treat future Streamable HTTP mode as a separate deployment/security decision.
- Do not execute arbitrary shell commands.
- Do not read arbitrary local files.
- Only load an explicitly configured generated dataset path.
- Validate all tool inputs with schemas.
- Limit response size to avoid dumping huge datasets into LLM context.
- Include dataset id/version in solve and lookup responses.

## Implementation Path

1. Wait until `game-data`, `planner-core`, and `solver` packages are stable enough to reuse.
2. Create a local-only assistant/tooling package with transport-independent core functions.
3. Implement metadata/items/recipes/machines resources.
4. Implement item/recipe search tools.
5. Add a tiny fixture dataset for tests.
6. Add `solve_plan` once solver APIs are stable.
7. Add an MCP wrapper or local HTTP wrapper.
8. Test with an MCP inspector/client, local LLM runtime, or simple stream-bot harness.
9. Decide later whether this should remain developer-only or become a supported Beltwise companion tool.

## Open Questions

- Which transport should come first: MCP stdio, local HTTP, CLI, or stream-bot wrapper?
- If using MCP, which official MCP TypeScript SDK package/version should be used when implementation starts?
- Should the tool service be distributed with Beltwise, or live as a separate developer tool?
- Should it support user projects from local storage/IndexedDB exports?
- Should it include graph output, or only production-plan summaries?
- Should save-file resource providers ever be callable through assistant/tooling integrations?
- Should stream-bot responses be pure deterministic text, LLM-formatted, or both?
