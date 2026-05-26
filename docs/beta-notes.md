# Beltwise Beta Notes

Status: public-facing beta expectations and support notes.

This page is a short companion to the [user guide](./user-guide.md). It is meant
to set expectations for beta testers before Beltwise is treated as generally
available.

## What The Beta Is For

- Validate the main graph-first planning workflow.
- Find confusing workbench flows before they become habits.
- Catch solver, data, import/export, and persistence bugs with real plans.
- Test whether local-first storage plus explicit export/share tools is clear
  enough for players.
- Learn which help topics deserve deeper guides or short videos.

## What To Expect

Beltwise should already handle normal production plans, multiple output targets,
recipe choices, resource caps, external inputs, power targets, sink rules, graph
display settings, notes, and local plan management.

During beta, assume the following:

- Plans may need to be re-exported after schema or data changes.
- Local browser storage is convenient but not a backup.
- Some advanced factory workflows are intentionally out of scope.
- Documentation will improve as repeated tester questions appear.

## Data Safety

Before testing risky workflows, export any plan you care about from **Tools >
Export plan**.

Local sessions, plans, and defaults can be removed by browser cleanup tools,
private browsing resets, site-data clearing, browser profile changes, or using a
different device.

## Known Scope Boundaries

The beta does not include save-file import, randomized resource seed detection,
session-wide logistics balancing, map planning, train planning, blueprint export,
server accounts, or collaborative editing.

Those are future directions, not hidden beta features.

## Good Bug Reports

For planning or solver issues, include an exported plan JSON or copied plan link
when possible. For visual issues, include a screenshot and your screen size. For
persistence or transfer issues, describe whether you refreshed, imported,
exported, cleared data, or switched browsers.

Useful reports usually answer:

- What did you expect Beltwise to do?
- What did Beltwise do instead?
- Can the issue be reproduced after refresh?
- Did the issue happen with a fresh plan or only an older/imported plan?
- Which browser and operating system were you using?

## Docs Strategy

Use versioned docs in this repository for official beta help. A community wiki
can come later if testers start producing strategy guides, recipes, or build
examples that should evolve outside the app release cycle.
