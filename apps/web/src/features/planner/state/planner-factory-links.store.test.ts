import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset, type ItemId } from '@beltwise/game-data';
import {
  createPlannerProject,
  createPlannerSession,
  type PlannerProject,
  type PlannerSession,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import {
  PlannerFactoryLinksStore,
  PLANNER_FACTORY_LINKS_STORE_PORT,
  type PlannerFactoryLinksStorePort,
} from './planner-factory-links.store';

const NOW = '2026-05-27T00:00:00.000Z';

describe('PlannerFactoryLinksStore', () => {
  it('creates a session link and raises the destination external input to the linked amount', () => {
    const source = createProject('source', 'Iron parts', 'Desc_IronPlate_C', 60);
    const destination = createProject('destination', 'Assembler', 'Desc_Rotor_C', 10);
    destination.itemInputs = { Desc_IronPlate_C: { amountPerMinute: 15 } };
    const { store, projects, activeSession } = createFactoryLinksHarness(source, destination);

    store.createLink({
      sourceTargetId: 'source-target',
      destinationProjectId: destination.id,
      destinationItemId: 'Desc_IronPlate_C',
      amountPerMinute: 45,
    });

    expect(activeSession()?.links).toMatchObject([
      {
        itemId: 'Desc_IronPlate_C',
        amountPerMinute: 45,
        source: { kind: 'target-output', projectId: source.id, targetId: 'source-target' },
        destination: {
          kind: 'external-input',
          projectId: destination.id,
          itemId: 'Desc_IronPlate_C',
        },
      },
    ]);
    expect(projectById(projects(), destination.id).itemInputs['Desc_IronPlate_C']).toEqual({
      amountPerMinute: 45,
    });
  });

  it('preserves a larger manual destination input and exposes active-plan rows', () => {
    const source = createProject('source', 'Iron parts', 'Desc_IronPlate_C', 60);
    const destination = createProject('destination', 'Assembler', 'Desc_Rotor_C', 10);
    destination.itemInputs = { Desc_IronPlate_C: { amountPerMinute: 80 } };
    const { store, projects, activeSession, activeProject } = createFactoryLinksHarness(
      source,
      destination,
    );

    store.createLink({
      sourceTargetId: 'source-target',
      destinationProjectId: destination.id,
      destinationItemId: 'Desc_IronPlate_C',
      amountPerMinute: 45,
    });

    expect(projectById(projects(), destination.id).itemInputs['Desc_IronPlate_C']).toEqual({
      amountPerMinute: 80,
    });
    expect(store.supplyingRows()).toMatchObject([
      {
        itemLabel: 'Iron Plate',
        otherPlanLabel: 'Assembler',
        amountPerMinuteLabel: '45/min',
        statusLabel: 'Healthy',
      },
    ]);

    activeProject.set(projectById(projects(), destination.id));

    expect(store.receivingRows()).toMatchObject([
      {
        itemLabel: 'Iron Plate',
        otherPlanLabel: 'Iron parts',
        amountPerMinuteLabel: '45/min',
      },
    ]);
    expect(store.inputCoverageRows()).toEqual([
      {
        itemId: 'Desc_IronPlate_C',
        linkedAmountPerMinute: 45,
        manualRemainderAmountPerMinute: 35,
        linkedAmountPerMinuteLabel: '45/min',
        manualRemainderAmountPerMinuteLabel: '35/min',
      },
    ]);
    expect(activeSession()?.links).toHaveLength(1);
  });

  it('removes and pauses links without changing destination external inputs', () => {
    const source = createProject('source', 'Iron parts', 'Desc_IronPlate_C', 60);
    const destination = createProject('destination', 'Assembler', 'Desc_Rotor_C', 10);
    const { store, projects, activeSession } = createFactoryLinksHarness(source, destination);
    store.createLink({
      sourceTargetId: 'source-target',
      destinationProjectId: destination.id,
      destinationItemId: 'Desc_IronPlate_C',
      amountPerMinute: 30,
    });
    const linkId = activeSession()?.links[0]?.id;
    if (!linkId) {
      throw new Error('Expected created link');
    }

    store.setPaused(linkId, true);
    expect(activeSession()?.links[0]?.paused).toBe(true);

    store.removeLink(linkId);

    expect(activeSession()?.links).toEqual([]);
    expect(projectById(projects(), destination.id).itemInputs['Desc_IronPlate_C']).toEqual({
      amountPerMinute: 30,
    });
  });

  it('does not count stale destination links as input coverage', () => {
    const source = createProject('source', 'Iron parts', 'Desc_IronPlate_C', 60);
    const destination = createProject('destination', 'Assembler', 'Desc_Rotor_C', 10);
    destination.itemInputs = { Desc_IronPlate_C: { amountPerMinute: 30 } };
    const { store, activeProject, activeSession } = createFactoryLinksHarness(source, destination);
    activeSession.update((session) =>
      session
        ? {
            ...session,
            links: [
              {
                id: 'stale-link',
                itemId: 'Desc_IronPlate_C',
                amountPerMinute: 30,
                source: {
                  kind: 'target-output',
                  projectId: source.id,
                  targetId: 'missing-target',
                },
                destination: {
                  kind: 'external-input',
                  projectId: destination.id,
                  itemId: 'Desc_IronPlate_C',
                },
              },
            ],
          }
        : session,
    );
    activeProject.set(destination);

    expect(store.receivingRows()).toMatchObject([
      {
        statusLabel: 'Missing source',
      },
    ]);
    expect(store.inputCoverageRows()).toEqual([]);
  });

  it('rejects links to the active plan, missing plans, and plans outside the active session', () => {
    const source = createProject('source', 'Iron parts', 'Desc_IronPlate_C', 60);
    const destination = createProject('destination', 'Assembler', 'Desc_Rotor_C', 10);
    const outsider = createProject('outsider', 'Other session', 'Desc_Rotor_C', 10);
    const { store, projects, activeSession, activeSessionProjects } = createFactoryLinksHarness(
      source,
      destination,
    );
    projects.set([source, destination, outsider]);

    for (const destinationProjectId of [source.id, outsider.id, 'missing-project']) {
      store.createLink({
        sourceTargetId: 'source-target',
        destinationProjectId,
        destinationItemId: 'Desc_IronPlate_C',
        amountPerMinute: 20,
      });
    }

    expect(activeSession()?.links).toEqual([]);

    activeSessionProjects.set([source, destination, outsider]);
    activeSession.update((session) =>
      session ? { ...session, projectIds: [...session.projectIds, outsider.id] } : session,
    );

    store.createLink({
      sourceTargetId: 'source-target',
      destinationProjectId: outsider.id,
      destinationItemId: 'Desc_IronPlate_C',
      amountPerMinute: 20,
    });

    expect(activeSession()?.links).toHaveLength(1);
  });
});

function createFactoryLinksHarness(
  source: PlannerProject,
  destination: PlannerProject,
): {
  store: PlannerFactoryLinksStore;
  projects: WritableSignal<PlannerProject[]>;
  activeProject: WritableSignal<PlannerProject | null>;
  activeSession: WritableSignal<PlannerSession | null>;
  activeSessionProjects: WritableSignal<PlannerProject[]>;
} {
  const projects = signal<PlannerProject[]>([source, destination]);
  const activeProject = signal<PlannerProject | null>(source);
  const activeSession = signal<PlannerSession | null>(
    createPlannerSession({
      id: 'session-a',
      name: 'Session',
      datasetId: tinySatisfactoryDataset.id,
      projectIds: [source.id, destination.id],
      activeProjectId: source.id,
      now: NOW,
    }),
  );
  const activeSessionProjects = signal<PlannerProject[]>([source, destination]);
  const port: PlannerFactoryLinksStorePort = {
    dataset: signal<GameDataset | null>(tinySatisfactoryDataset),
    activeSession,
    activeProject,
    activeSessionProjects,
    projects,
    solveResult: signal<ProductionPlanResult | null>(null),
    updateActiveSession: (mapper) => {
      activeSession.update((session) => (session ? mapper(session) : session));
    },
    updateProjectById: (projectId, mapper) => {
      projects.update((currentProjects) =>
        currentProjects.map((project) => (project.id === projectId ? mapper(project) : project)),
      );
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: PLANNER_FACTORY_LINKS_STORE_PORT, useValue: port },
      PlannerFactoryLinksStore,
    ],
  });
  const store = runInInjectionContext(injector, () => injector.get(PlannerFactoryLinksStore));
  return { store, projects, activeProject, activeSession, activeSessionProjects };
}

function createProject(
  id: string,
  name: string,
  itemId: ItemId,
  amountPerMinute: number,
): PlannerProject {
  return createPlannerProject({
    id,
    name,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: `${id}-target`,
        itemId,
        mode: 'fixed',
        amountPerMinute,
        sortOrder: 0,
      },
    ],
  });
}

function projectById(projects: readonly PlannerProject[], projectId: string): PlannerProject {
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Expected project ${projectId}`);
  }
  return project;
}
