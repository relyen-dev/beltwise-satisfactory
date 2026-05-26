import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type ItemId } from '@beltwise/game-data';
import {
  createEmptyProductionPlanResult,
  createPlannerProject,
  createPlannerSession,
  selectPlannerSessionLinkHealth,
  type PlannerProject,
  type PlannerSession,
  type PlannerSessionLink,
  type ProductionPlanResult,
} from '@beltwise/planner-core';

const NOW = '2026-05-12T00:00:00.000Z';
const SOURCE_PROJECT_ID = 'project-source';
const DESTINATION_PROJECT_ID = 'project-destination';
const PLATE_ITEM_ID: ItemId = 'Desc_IronPlate_C';
const WIRE_ITEM_ID: ItemId = 'Desc_Wire_C';

describe('linked plan contract health', () => {
  it('reports healthy partial links between source target output and destination input', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 20 });
    const destinationProject = createDestinationProject({ amountPerMinute: 10 });
    const session = createLinkedSession([createLink({ amountPerMinute: 5 })]);

    const [health] = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health).toMatchObject({
      status: 'healthy',
      issues: [],
      sourceAvailableAmountPerMinute: 20,
      sourceCommittedAmountPerMinute: 5,
      destinationRequiredAmountPerMinute: 10,
      destinationCoveredAmountPerMinute: 5,
    });
  });

  it('uses optional solve results when evaluating maximized source targets', () => {
    const sourceProject = createSourceProject({ mode: 'maximize' });
    const destinationProject = createDestinationProject({ amountPerMinute: 12 });
    const session = createLinkedSession([createLink({ amountPerMinute: 8 })]);
    const solveResult: ProductionPlanResult = {
      ...createEmptyProductionPlanResult(),
      outputs: { [PLATE_ITEM_ID]: 12 },
      itemFlows: [
        {
          itemId: PLATE_ITEM_ID,
          amountPerMinute: 12,
          source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
          target: { kind: 'output', id: 'target-plates' },
        },
      ],
    };

    const [health] = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
      solveResultsByProjectId: { [sourceProject.id]: solveResult },
    });

    expect(health?.status).toBe('healthy');
    expect(health?.sourceAvailableAmountPerMinute).toBe(12);
  });

  it('reports missing-source when the source project or target is stale', () => {
    const destinationProject = createDestinationProject({ amountPerMinute: 10 });
    const session = createLinkedSession([createLink({ amountPerMinute: 5 })]);

    const [health] = selectPlannerSessionLinkHealth({
      session,
      projects: [destinationProject],
    });

    expect(health?.status).toBe('missing-source');
    expect(health?.issues).toEqual(['missing-source']);
  });

  it('reports missing-destination when the destination input is absent', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 20 });
    const destinationProject = createPlannerProject({
      id: DESTINATION_PROJECT_ID,
      name: 'Destination',
      dataset: tinySatisfactoryDataset,
      now: NOW,
    });
    const session = createLinkedSession([createLink({ amountPerMinute: 5 })]);

    const [health] = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health?.status).toBe('missing-destination');
    expect(health?.issues).toEqual(['missing-destination']);
  });

  it('reports source-short when an individual link asks for more than the source can provide', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 4 });
    const destinationProject = createDestinationProject({ amountPerMinute: 10 });
    const session = createLinkedSession([createLink({ amountPerMinute: 5 })]);

    const [health] = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health?.status).toBe('source-short');
    expect(health?.issues).toContain('source-short');
  });

  it('reports source-overcommitted when active links reserve more than a source output', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 10 });
    const destinationProject = createDestinationProject({ amountPerMinute: 20 });
    const session = createLinkedSession([
      createLink({ id: 'link-a', amountPerMinute: 6 }),
      createLink({ id: 'link-b', amountPerMinute: 6 }),
    ]);

    const health = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health.map((entry) => entry.status)).toEqual([
      'source-overcommitted',
      'source-overcommitted',
    ]);
    expect(health[0]?.sourceCommittedAmountPerMinute).toBe(12);
  });

  it('ignores stale source links when totaling source commitments', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 10 });
    const destinationProject = createDestinationProject({
      amountPerMinute: 20,
      wireAmountPerMinute: 20,
    });
    const session = createLinkedSession([
      createLink({ id: 'link-valid', amountPerMinute: 6 }),
      createLink({
        id: 'link-stale-source',
        itemId: WIRE_ITEM_ID,
        sourceTargetId: 'target-plates',
        destinationItemId: WIRE_ITEM_ID,
        amountPerMinute: 6,
      }),
    ]);

    const health = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health.map((entry) => entry.status)).toEqual(['healthy', 'missing-source']);
    expect(health[0]?.sourceCommittedAmountPerMinute).toBe(6);
  });

  it('reports destination-overcovered when active links cover more than the input asks for', () => {
    const sourceProject = createSourceProject({ amountPerMinute: 20 });
    const destinationProject = createDestinationProject({ amountPerMinute: 5 });
    const session = createLinkedSession([
      createLink({ id: 'link-a', amountPerMinute: 3 }),
      createLink({ id: 'link-b', amountPerMinute: 3 }),
    ]);

    const health = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health.map((entry) => entry.status)).toEqual([
      'destination-overcovered',
      'destination-overcovered',
    ]);
    expect(health[0]?.destinationCoveredAmountPerMinute).toBe(6);
  });

  it('ignores stale destination links when totaling destination coverage', () => {
    const sourceProject = createSourceProject({
      amountPerMinute: 20,
      wireTargetAmountPerMinute: 20,
    });
    const destinationProject = createDestinationProject({ amountPerMinute: 5 });
    const session = createLinkedSession([
      createLink({ id: 'link-valid', amountPerMinute: 3 }),
      createLink({
        id: 'link-stale-destination',
        itemId: WIRE_ITEM_ID,
        sourceTargetId: 'target-wire',
        destinationItemId: PLATE_ITEM_ID,
        amountPerMinute: 3,
      }),
    ]);

    const health = selectPlannerSessionLinkHealth({
      session,
      projects: [sourceProject, destinationProject],
    });

    expect(health.map((entry) => entry.status)).toEqual(['healthy', 'missing-destination']);
    expect(health[0]?.destinationCoveredAmountPerMinute).toBe(3);
  });
});

function createSourceProject(options: {
  readonly amountPerMinute?: number;
  readonly mode?: 'fixed' | 'maximize';
  readonly wireTargetAmountPerMinute?: number;
}): PlannerProject {
  const mode = options.mode ?? 'fixed';
  const targets: PlannerProject['targets'] = [
    mode === 'fixed'
      ? {
          id: 'target-plates',
          itemId: PLATE_ITEM_ID,
          mode,
          amountPerMinute: options.amountPerMinute ?? 20,
          sortOrder: 0,
        }
      : {
          id: 'target-plates',
          itemId: PLATE_ITEM_ID,
          mode,
          sortOrder: 0,
        },
  ];
  if (options.wireTargetAmountPerMinute !== undefined) {
    targets.push({
      id: 'target-wire',
      itemId: WIRE_ITEM_ID,
      mode: 'fixed',
      amountPerMinute: options.wireTargetAmountPerMinute,
      sortOrder: 1,
    });
  }

  return {
    ...createPlannerProject({
      id: SOURCE_PROJECT_ID,
      name: 'Source',
      dataset: tinySatisfactoryDataset,
      now: NOW,
    }),
    targets,
  };
}

function createDestinationProject(options: {
  readonly amountPerMinute: number;
  readonly wireAmountPerMinute?: number;
}): PlannerProject {
  const itemInputs: PlannerProject['itemInputs'] = {
    [PLATE_ITEM_ID]: { amountPerMinute: options.amountPerMinute },
  };
  if (options.wireAmountPerMinute !== undefined) {
    itemInputs[WIRE_ITEM_ID] = { amountPerMinute: options.wireAmountPerMinute };
  }

  return {
    ...createPlannerProject({
      id: DESTINATION_PROJECT_ID,
      name: 'Destination',
      dataset: tinySatisfactoryDataset,
      now: NOW,
    }),
    itemInputs,
  };
}

function createLinkedSession(links: readonly PlannerSessionLink[]): PlannerSession {
  return createPlannerSession({
    id: 'session-linked',
    name: 'Linked',
    datasetId: tinySatisfactoryDataset.id,
    projectIds: [SOURCE_PROJECT_ID, DESTINATION_PROJECT_ID],
    activeProjectId: DESTINATION_PROJECT_ID,
    links,
    now: NOW,
  });
}

function createLink(
  options: Partial<Pick<PlannerSessionLink, 'id' | 'amountPerMinute' | 'itemId'>> & {
    readonly sourceTargetId?: string;
    readonly destinationItemId?: ItemId;
  } = {},
): PlannerSessionLink {
  const itemId = options.itemId ?? PLATE_ITEM_ID;
  return {
    id: options.id ?? 'link-plates',
    itemId,
    amountPerMinute: options.amountPerMinute ?? 5,
    source: {
      kind: 'target-output',
      projectId: SOURCE_PROJECT_ID,
      targetId: options.sourceTargetId ?? 'target-plates',
    },
    destination: {
      kind: 'external-input',
      projectId: DESTINATION_PROJECT_ID,
      itemId: options.destinationItemId ?? itemId,
    },
  };
}
