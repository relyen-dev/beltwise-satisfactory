import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  BELTWISE_PLAN_EXPORT_KIND,
  createBeltwisePlanExportFilename,
  createDefaultUserDefaults,
  createObjectiveProfileFromPreset,
  createPlannerProject,
  createUniqueImportedPlannerProjectName,
  decodeBeltwisePlanExport,
  encodeBeltwisePlanExport,
  MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES,
  parseBeltwisePlanExportJson,
  prepareImportedPlannerProject,
  stringifyBeltwisePlanExport,
  type PlannerProject,
} from '@beltwise/planner-core';

describe('Beltwise plan export files', () => {
  it('exports authored plan configuration without solver output or user defaults', () => {
    const project = createDomainPlannerProject();
    const projectWithDerivedState = {
      ...project,
      solverResult: { status: 'optimal' },
      targets: project.targets.map((target) => ({
        ...target,
        solvedAmountPerMinute: 999,
      })),
    };

    const exportFile = encodeBeltwisePlanExport(projectWithDerivedState, {
      dataset: tinySatisfactoryDataset,
      exportedAt: '2026-05-13T00:00:00.000Z',
    });

    expect(exportFile).toEqual({
      kind: BELTWISE_PLAN_EXPORT_KIND,
      formatVersion: 1,
      exportedAt: '2026-05-13T00:00:00.000Z',
      sourceApp: 'Beltwise',
      dataset: {
        datasetId: tinySatisfactoryDataset.id,
        game: 'satisfactory',
        gameVersionLabel: tinySatisfactoryDataset.gameVersionLabel,
        generatedAt: tinySatisfactoryDataset.generatedAt,
        source: {
          docsFileName: tinySatisfactoryDataset.source.docsFileName,
          fingerprint: tinySatisfactoryDataset.source.fingerprint,
        },
      },
      project: {
        id: 'project-export',
        name: 'Iron floor',
        notes: 'Check belts\nBring power shards',
        datasetId: tinySatisfactoryDataset.id,
        createdAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
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
      },
    });
    expect('solverResult' in exportFile.project).toBe(false);
    expect('solvedAmountPerMinute' in exportFile.project.targets[0]).toBe(false);
    expect('userDefaults' in exportFile).toBe(false);
    expect('sessions' in exportFile).toBe(false);
    expect('activeSessionId' in exportFile).toBe(false);
    expect('sessionId' in exportFile.project).toBe(false);
  });

  it('decodes exported JSON and preserves plan-scoped ids, layout, and build notes', () => {
    const project = createDomainPlannerProject();
    const exportFile = encodeBeltwisePlanExport(project, {
      dataset: tinySatisfactoryDataset,
      exportedAt: '2026-05-13T00:00:00.000Z',
    });

    const decoded = parseBeltwisePlanExportJson(
      stringifyBeltwisePlanExport(exportFile),
      tinySatisfactoryDataset,
    );

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.warnings).toEqual([]);
    expect(decoded.project.targets.map((target) => target.id)).toEqual([
      'target-fixed',
      'target-maximize',
    ]);
    expect(decoded.project.graphLayout).toEqual(project.graphLayout);
    expect(decoded.project.buildState).toEqual(project.buildState);
    expect(decoded.project.notes).toBe(project.notes);
    expect(decoded.project.objectiveProfile).toEqual(project.objectiveProfile);
  });

  it('round-trips objective preset strategy and stage order', () => {
    const project = {
      ...createDomainPlannerProject(),
      objectiveProfile: createObjectiveProfileFromPreset('few-machines', {
        rawResourceMultipliers: {
          Desc_OreIron_C: 1.25,
        },
      }),
    };

    const decoded = parseBeltwisePlanExportJson(
      stringifyBeltwisePlanExport(
        encodeBeltwisePlanExport(project, {
          dataset: tinySatisfactoryDataset,
        }),
      ),
      tinySatisfactoryDataset,
    );

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.objectiveProfile).toEqual(project.objectiveProfile);
  });

  it('prepares imported projects with a new local id and fresh timestamps', () => {
    const importedAt = '2026-05-14T00:00:00.000Z';
    const prepared = prepareImportedPlannerProject(createDomainPlannerProject(), {
      dataset: tinySatisfactoryDataset,
      id: 'project-imported',
      name: 'Iron floor import',
      now: importedAt,
    });

    expect(prepared).toMatchObject({
      id: 'project-imported',
      name: 'Iron floor import',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: importedAt,
      updatedAt: importedAt,
    });
    expect(prepared.targets.map((target) => target.id)).toEqual([
      'target-fixed',
      'target-maximize',
    ]);
    expect(prepared.notes).toBe('Check belts\nBring power shards');
    expect(prepared.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 25, y: 50 },
    });
    expect(prepared.buildState.nodeStates['recipe:Recipe_IronPlate_C']).toEqual({
      done: true,
      note: 'Floor 2',
    });
  });

  it('makes duplicate imported names unique', () => {
    expect(createUniqueImportedPlannerProjectName('Iron floor', ['Starter factory'])).toBe(
      'Iron floor',
    );
    expect(createUniqueImportedPlannerProjectName('Iron floor', ['Iron floor'])).toBe(
      'Iron floor import',
    );
    expect(
      createUniqueImportedPlannerProjectName('Iron floor', ['Iron floor', 'Iron floor import']),
    ).toBe('Iron floor import 2');
  });

  it('sanitizes export filenames', () => {
    expect(createBeltwisePlanExportFilename('My Plan! 2')).toBe('beltwise-my-plan-2.json');
    expect(createBeltwisePlanExportFilename('   ')).toBe('beltwise-plan.json');
  });

  it('fails cleanly for malformed JSON, wrong kind, future versions, and invalid projects', () => {
    expect(parseBeltwisePlanExportJson('{', tinySatisfactoryDataset)).toMatchObject({
      ok: false,
      error: { code: 'malformed-json' },
    });
    expect(
      decodeBeltwisePlanExport(
        {
          kind: 'beltwise.workspace',
          formatVersion: 1,
        },
        tinySatisfactoryDataset,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'wrong-kind' },
    });
    expect(
      decodeBeltwisePlanExport(
        {
          ...encodeBeltwisePlanExport(createDomainPlannerProject(), {
            dataset: tinySatisfactoryDataset,
          }),
          formatVersion: 2,
        },
        tinySatisfactoryDataset,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
    expect(
      decodeBeltwisePlanExport(
        {
          ...encodeBeltwisePlanExport(createDomainPlannerProject(), {
            dataset: tinySatisfactoryDataset,
          }),
          project: { id: 'project-only' },
        },
        tinySatisfactoryDataset,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-project' },
    });
  });

  it('rejects oversized imported JSON before parsing', () => {
    const oversizedJson = ' '.repeat(MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES + 1);

    expect(parseBeltwisePlanExportJson(oversizedJson, tinySatisfactoryDataset)).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-envelope',
        message: 'That plan file is too large to import.',
      },
    });
  });

  it('warns but still decodes when exported dataset metadata differs', () => {
    const currentDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      id: 'satisfactory-current',
      gameVersionLabel: '1.1',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'current-fingerprint',
      },
    };
    const exportFile = encodeBeltwisePlanExport(createDomainPlannerProject(), {
      dataset: tinySatisfactoryDataset,
    });

    const decoded = decodeBeltwisePlanExport(exportFile, currentDataset);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }
    expect(decoded.project.name).toBe('Iron floor');
    expect(decoded.warnings).toEqual([
      {
        code: 'dataset-mismatch',
        exportedDatasetId: tinySatisfactoryDataset.id,
        currentDatasetId: 'satisfactory-current',
        message:
          'This plan was exported with dataset satisfactory-tiny-fixture (fixture) and was ' +
          'imported with the current dataset satisfactory-current (1.1).',
      },
    ]);
  });
});

function createDomainPlannerProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-export',
      name: 'Iron floor',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
      userDefaults: createDefaultUserDefaults(tinySatisfactoryDataset),
    }),
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
