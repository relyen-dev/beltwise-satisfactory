import { computed, signal, type Signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  encodeBeltwisePlanExport,
  encodeBeltwisePlanShare,
  stringifyBeltwisePlanExport,
  type PlannerProject,
} from '@beltwise/planner-core';
import { PlannerPlanTransferCapability } from './planner-plan-transfer-capability';

const NOW = '2026-05-12T00:00:00.000Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('PlannerPlanTransferCapability', () => {
  it('reports the existing no-plan and loading messages without importing anything', () => {
    const noPlan = createCapabilityHarness({ projects: [], activeProjectId: undefined });
    expect(noPlan.capability.exportActivePlan()).toEqual({
      ok: false,
      message: 'There is no active plan to export yet.',
    });
    expect(noPlan.capability.exportActivePlanSharePayload()).toEqual({
      ok: false,
      message: 'There is no active plan to share yet.',
    });
    expect(noPlan.flushGraphNodePositions).toHaveBeenCalledTimes(2);

    const noDataset = createCapabilityHarness({ dataset: null });
    expect(noDataset.capability.importPlanJson('{}')).toEqual({
      ok: false,
      message: 'Planner data is still loading. Try importing again shortly.',
    });
    expect(noDataset.capability.importPlanSharePayload({})).toEqual({
      ok: false,
      message: 'Planner data is still loading. Try importing again shortly.',
    });
    expect(noDataset.importProject).not.toHaveBeenCalled();
  });

  it('exports active plan JSON with the current filename and plan-only shape', () => {
    const project = createProject();
    const { capability, flushGraphNodePositions } = createCapabilityHarness({ projects: [project] });

    const result = capability.exportActivePlan();

    expect(flushGraphNodePositions).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.filename).toBe('beltwise-factory.json');
    const parsed = JSON.parse(result.json) as {
      project: Record<string, unknown>;
      userDefaults?: unknown;
      sessions?: unknown;
      activeSessionId?: unknown;
    };
    expect(parsed.project['updatedAt']).toBe(project.updatedAt);
    expect('userDefaults' in parsed).toBe(false);
    expect('sessions' in parsed).toBe(false);
    expect('activeSessionId' in parsed).toBe(false);
  });

  it('exports compact share payloads after flushing graph positions', () => {
    const project = createProject();
    const { capability, flushGraphNodePositions } = createCapabilityHarness({ projects: [project] });

    const result = capability.exportActivePlanSharePayload();

    expect(flushGraphNodePositions).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.payload).toMatchObject({
      k: 'bw.p',
      v: 1,
      p: {
        n: 'Factory',
        t: [
          {
            id: 'target-a',
            i: 'Desc_IronPlate_C',
            m: 'f',
            a: 10,
            s: 0,
          },
        ],
      },
    });
    expect('userDefaults' in result.payload).toBe(false);
    expect('sessions' in result.payload).toBe(false);
    expect('activeSessionId' in result.payload).toBe(false);
  });

  it('imports plan JSON as a prepared project with a unique active-session name', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));
    const existingProject = createProject();
    const importSource = createImportSourceProject('project-source', 'Factory');
    const { capability, projects, importProject } = createCapabilityHarness({
      projects: [existingProject],
    });

    const result = capability.importPlanJson(createPlanExportJson(importSource));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(importProject).toHaveBeenCalledOnce();
    expect(projects()).toHaveLength(2);
    expect(result.project.id).not.toBe(importSource.id);
    expect(result.project.id).not.toBe(existingProject.id);
    expect(result.project).toMatchObject({
      name: 'Factory import',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
      notes: importSource.notes,
      targets: importSource.targets,
      recipeOverrides: importSource.recipeOverrides,
      machineOverrides: importSource.machineOverrides,
      resourceOverrides: importSource.resourceOverrides,
      itemInputs: importSource.itemInputs,
      objectiveProfile: importSource.objectiveProfile,
      graphDisplay: importSource.graphDisplay,
      graphLayout: importSource.graphLayout,
      buildState: importSource.buildState,
    });
    expect(projects()[0]).toEqual(existingProject);
  });

  it('increments imported project names against only the active session project names', () => {
    const existingProject = createProject();
    const existingImport = { ...createProject(), id: 'project-import', name: 'Factory import' };
    const importSource = createImportSourceProject('project-source', 'Factory');
    const { capability } = createCapabilityHarness({
      projects: [existingProject, existingImport],
    });

    const result = capability.importPlanJson(createPlanExportJson(importSource));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.project.name).toBe('Factory import 2');
  });

  it('propagates dataset warnings from decoded plan imports', () => {
    const exportedDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      id: 'older-dataset',
      gameVersionLabel: 'older',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'older-fingerprint',
      },
    };
    const importSource = createImportSourceProject('project-source', 'Imported factory');
    const { capability } = createCapabilityHarness();

    const result = capability.importPlanJson(createPlanExportJson(importSource, exportedDataset));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'dataset-mismatch',
      exportedDatasetId: 'older-dataset',
      currentDatasetId: tinySatisfactoryDataset.id,
    });
  });

  it('imports compact share payloads through the same project preparation path', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));
    const existingProject = createProject();
    const importSource = createImportSourceProject('project-source', 'Factory');
    const { capability, projects } = createCapabilityHarness({ projects: [existingProject] });

    const result = capability.importPlanSharePayload(
      encodeBeltwisePlanShare(importSource, tinySatisfactoryDataset),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(projects()).toHaveLength(2);
    expect(result.project).toMatchObject({
      name: 'Factory import',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
      notes: importSource.notes,
      targets: importSource.targets,
      recipeOverrides: importSource.recipeOverrides,
      machineOverrides: importSource.machineOverrides,
      resourceOverrides: {
        Desc_OreIron_C: { maxPerMinute: 120 },
      },
      itemInputs: importSource.itemInputs,
      objectiveProfile: importSource.objectiveProfile,
      graphDisplay: importSource.graphDisplay,
      graphLayout: importSource.graphLayout,
      buildState: importSource.buildState,
    });
    expect(projects()[0]).toEqual(existingProject);
  });

  it('leaves projects unchanged when decoded imports are rejected', () => {
    const existingProject = createProject();
    const { capability, projects, importProject } = createCapabilityHarness({
      projects: [existingProject],
    });

    expect(capability.importPlanJson('{')).toMatchObject({
      ok: false,
      message: 'That file is not valid JSON.',
    });
    expect(capability.importPlanSharePayload({ k: 'bw.p', v: 99, d: {}, p: {} })).toMatchObject({
      ok: false,
      message: 'This plan link uses a newer Beltwise format.',
    });
    expect(importProject).not.toHaveBeenCalled();
    expect(projects()).toEqual([existingProject]);
  });
});

function createCapabilityHarness(
  options: {
    readonly dataset?: GameDataset | null;
    readonly projects?: readonly PlannerProject[];
    readonly activeProjectId?: string;
  } = {},
): PlannerPlanTransferCapabilityHarness {
  const dataset = signal<GameDataset | null>(
    'dataset' in options ? (options.dataset ?? null) : tinySatisfactoryDataset,
  );
  const projects = signal<PlannerProject[]>([...(options.projects ?? [createProject()])]);
  const activeProjectId = signal<string | undefined>(
    options.activeProjectId ?? projects()[0]?.id,
  );
  const activeProject = computed(
    () => projects().find((project) => project.id === activeProjectId()) ?? null,
  );
  const flushGraphNodePositions = vi.fn();
  const importProject = vi.fn((project: PlannerProject) => {
    projects.update((currentProjects) => [...currentProjects, project]);
    activeProjectId.set(project.id);
  });
  const capability = new PlannerPlanTransferCapability({
    dataset,
    activeProject,
    activeSessionProjects: projects,
    flushGraphNodePositions,
    importProject,
  });

  return {
    capability,
    projects,
    flushGraphNodePositions,
    importProject,
  };
}

function createProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: 'target-a',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ],
  });
}

function createImportSourceProject(id: string, name: string): PlannerProject {
  return {
    ...createProject(),
    id,
    name,
    notes: 'Check belts\nBring power shards',
    targets: [
      {
        id: 'target-fixed',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 0,
      },
      {
        id: 'target-maximize',
        itemId: 'Desc_Wire_C',
        mode: 'maximize',
        sortOrder: 1,
      },
    ],
    recipeOverrides: {
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { enabled: true, maxPerMinute: 120 },
    },
    itemInputs: {
      Desc_IngotIron_C: { amountPerMinute: 15 },
    },
    objectiveProfile: {
      presetId: 'custom',
      strategy: 'lexicographic',
      stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
      resourceScarcityWeight: 2,
      powerWeight: 0.3,
      machineCountWeight: 0.4,
      surplusWeight: 0.1,
      rawResourceMultipliers: {
        Desc_OreIron_C: 1.5,
      },
    },
    graphLayout: {
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 25, y: 50 },
      },
    },
    graphDisplay: {
      maxBeltTier: 4,
      maxPipeTier: 1,
      rateDecimalPlaces: 4,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: false,
    },
    buildState: {
      planLocked: true,
      nodeLayoutLocked: true,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': {
          done: true,
          note: 'Floor 2',
        },
      },
    },
  };
}

function createPlanExportJson(
  project: PlannerProject,
  dataset: GameDataset = tinySatisfactoryDataset,
): string {
  return stringifyBeltwisePlanExport(
    encodeBeltwisePlanExport(project, {
      dataset,
      exportedAt: '2026-05-13T00:00:00.000Z',
    }),
  );
}

interface PlannerPlanTransferCapabilityHarness {
  readonly capability: PlannerPlanTransferCapability;
  readonly projects: Signal<readonly PlannerProject[]>;
  readonly flushGraphNodePositions: ReturnType<typeof vi.fn>;
  readonly importProject: ReturnType<typeof vi.fn>;
}
