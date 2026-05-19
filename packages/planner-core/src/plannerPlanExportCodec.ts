import type { GameDataset } from '@beltwise/game-data';
import { createStableId, type PlannerProject } from './plan';
import {
  decodeStoredPlannerProject,
  encodeStoredPlannerProject,
  type StoredPlannerProjectV1,
} from './plannerPersistenceCodec';
import {
  datasetImportWarnings,
  type BeltwisePlanImportWarning,
  type BeltwisePlanImportWarningCode,
} from './plannerDatasetTransferWarnings';
import { isPlanTransferRecord, readTransferString } from './planTransferFieldCodecs';

export type { BeltwisePlanImportWarning, BeltwisePlanImportWarningCode };

export const BELTWISE_PLAN_EXPORT_KIND = 'beltwise.plan';
export const BELTWISE_PLAN_EXPORT_FORMAT_VERSION = 1;
export const BELTWISE_PLAN_EXPORT_SOURCE_APP = 'Beltwise';
export const MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES = 5_242_880;

export type BeltwisePlanExportKind = typeof BELTWISE_PLAN_EXPORT_KIND;
export type BeltwisePlanExportFormatVersion = typeof BELTWISE_PLAN_EXPORT_FORMAT_VERSION;
export type BeltwisePlanExportSourceApp = typeof BELTWISE_PLAN_EXPORT_SOURCE_APP;

export interface BeltwisePlanExportDatasetMetadataV1 {
  datasetId: string;
  game: GameDataset['game'];
  gameVersionLabel: string;
  generatedAt: string;
  source: BeltwisePlanExportDatasetSourceMetadataV1;
}

export interface BeltwisePlanExportDatasetSourceMetadataV1 {
  docsFileName: string;
  docsLastModified?: string;
  fingerprint?: string;
}

export interface BeltwisePlanExportV1 {
  kind: BeltwisePlanExportKind;
  formatVersion: BeltwisePlanExportFormatVersion;
  exportedAt: string;
  sourceApp: BeltwisePlanExportSourceApp;
  dataset: BeltwisePlanExportDatasetMetadataV1;
  project: StoredPlannerProjectV1;
}

export type BeltwisePlanExportFile = BeltwisePlanExportV1;

export interface PrepareImportedPlannerProjectOptions {
  dataset: GameDataset;
  id?: string;
  name?: string;
  now?: string;
}

export interface DecodeBeltwisePlanExportSuccess {
  ok: true;
  exportFile: BeltwisePlanExportFile;
  project: PlannerProject;
  warnings: BeltwisePlanImportWarning[];
}

export interface DecodeBeltwisePlanExportFailure {
  ok: false;
  error: BeltwisePlanImportError;
}

export type DecodeBeltwisePlanExportResult =
  | DecodeBeltwisePlanExportSuccess
  | DecodeBeltwisePlanExportFailure;

export type BeltwisePlanImportErrorCode =
  | 'malformed-json'
  | 'invalid-envelope'
  | 'wrong-kind'
  | 'unsupported-version'
  | 'invalid-project';

export interface BeltwisePlanImportError {
  code: BeltwisePlanImportErrorCode;
  message: string;
}

export function encodeBeltwisePlanExport(
  project: PlannerProject,
  options: { dataset: GameDataset; exportedAt?: string },
): BeltwisePlanExportFile {
  return {
    kind: BELTWISE_PLAN_EXPORT_KIND,
    formatVersion: BELTWISE_PLAN_EXPORT_FORMAT_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    sourceApp: BELTWISE_PLAN_EXPORT_SOURCE_APP,
    dataset: toDatasetMetadata(options.dataset),
    project: encodeStoredPlannerProject(project),
  };
}

export function stringifyBeltwisePlanExport(file: BeltwisePlanExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseBeltwisePlanExportJson(
  json: string,
  dataset: GameDataset,
): DecodeBeltwisePlanExportResult {
  if (new TextEncoder().encode(json).byteLength > MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES) {
    return fail('invalid-envelope', 'That plan file is too large to import.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return fail('malformed-json', 'That file is not valid JSON.');
  }

  return decodeBeltwisePlanExport(parsed, dataset);
}

export function decodeBeltwisePlanExport(
  value: unknown,
  dataset: GameDataset,
): DecodeBeltwisePlanExportResult {
  if (!isPlanTransferRecord(value)) {
    return fail('invalid-envelope', 'That file is not a Beltwise plan export.');
  }

  if (value['kind'] !== BELTWISE_PLAN_EXPORT_KIND) {
    return fail('wrong-kind', 'That file is not a Beltwise plan export.');
  }

  if (value['formatVersion'] !== BELTWISE_PLAN_EXPORT_FORMAT_VERSION) {
    if (
      typeof value['formatVersion'] === 'number' &&
      value['formatVersion'] > BELTWISE_PLAN_EXPORT_FORMAT_VERSION
    ) {
      return fail('unsupported-version', 'This plan was exported by a newer Beltwise format.');
    }
    return fail('invalid-envelope', 'That Beltwise plan export has an invalid version.');
  }

  const exportedAt = readTransferString(value['exportedAt']);
  if (exportedAt === undefined || value['sourceApp'] !== BELTWISE_PLAN_EXPORT_SOURCE_APP) {
    return fail('invalid-envelope', 'That Beltwise plan export is missing required metadata.');
  }

  const datasetMetadata = readDatasetMetadata(value['dataset']);
  if (!datasetMetadata) {
    return fail('invalid-envelope', 'That Beltwise plan export is missing dataset metadata.');
  }

  const projectPayload = value['project'];
  if (!isStoredPlannerProjectV1(projectPayload)) {
    return fail('invalid-project', 'That Beltwise plan export has an invalid project payload.');
  }

  const project = decodeStoredPlannerProject(projectPayload, dataset);
  if (!project) {
    return fail('invalid-project', 'That Beltwise plan export has an invalid project payload.');
  }

  return {
    ok: true,
    exportFile: {
      kind: BELTWISE_PLAN_EXPORT_KIND,
      formatVersion: BELTWISE_PLAN_EXPORT_FORMAT_VERSION,
      exportedAt,
      sourceApp: BELTWISE_PLAN_EXPORT_SOURCE_APP,
      dataset: datasetMetadata,
      project: projectPayload,
    },
    project,
    warnings: datasetImportWarnings(
      exportDatasetMetadataForWarning(datasetMetadata),
      dataset,
      'exported',
    ),
  };
}

export function prepareImportedPlannerProject(
  project: PlannerProject,
  options: PrepareImportedPlannerProjectOptions,
): PlannerProject {
  const now = options.now ?? new Date().toISOString();
  return {
    ...structuredClone(project),
    id: options.id ?? createStableId('project'),
    name: options.name ?? project.name,
    datasetId: options.dataset.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUniqueImportedPlannerProjectName(
  importedName: string,
  existingNames: readonly string[],
): string {
  const baseName = importedName.trim() || 'Imported plan';
  if (!hasProjectName(existingNames, baseName)) {
    return baseName;
  }

  const importBaseName = `${baseName} import`;
  if (!hasProjectName(existingNames, importBaseName)) {
    return importBaseName;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${importBaseName} ${index}`;
    if (!hasProjectName(existingNames, candidate)) {
      return candidate;
    }
  }
}

export function createBeltwisePlanExportFilename(projectName: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `beltwise-${slug || 'plan'}.json`;
}

function toDatasetMetadata(dataset: GameDataset): BeltwisePlanExportDatasetMetadataV1 {
  const source: BeltwisePlanExportDatasetSourceMetadataV1 = {
    docsFileName: dataset.source.docsFileName,
  };
  if (dataset.source.docsLastModified !== undefined) {
    source.docsLastModified = dataset.source.docsLastModified;
  }
  if (dataset.source.fingerprint !== undefined) {
    source.fingerprint = dataset.source.fingerprint;
  }

  return {
    datasetId: dataset.id,
    game: dataset.game,
    gameVersionLabel: dataset.gameVersionLabel,
    generatedAt: dataset.generatedAt,
    source,
  };
}

function readDatasetMetadata(value: unknown): BeltwisePlanExportDatasetMetadataV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }

  const datasetId = readTransferString(value['datasetId']);
  const game = value['game'];
  const gameVersionLabel = readTransferString(value['gameVersionLabel']);
  const generatedAt = readTransferString(value['generatedAt']);
  const source = readDatasetSourceMetadata(value['source']);
  if (
    datasetId === undefined ||
    game !== 'satisfactory' ||
    gameVersionLabel === undefined ||
    generatedAt === undefined ||
    source === null
  ) {
    return null;
  }

  return {
    datasetId,
    game,
    gameVersionLabel,
    generatedAt,
    source,
  };
}

function readDatasetSourceMetadata(
  value: unknown,
): BeltwisePlanExportDatasetSourceMetadataV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }

  const docsFileName = readTransferString(value['docsFileName']);
  if (docsFileName === undefined) {
    return null;
  }

  const docsLastModified = readTransferString(value['docsLastModified']);
  const fingerprint = readTransferString(value['fingerprint']);
  return {
    docsFileName,
    ...(docsLastModified !== undefined ? { docsLastModified } : {}),
    ...(fingerprint !== undefined ? { fingerprint } : {}),
  };
}

function exportDatasetMetadataForWarning(datasetMetadata: BeltwisePlanExportDatasetMetadataV1) {
  return {
    id: datasetMetadata.datasetId,
    gameVersionLabel: datasetMetadata.gameVersionLabel,
    ...(datasetMetadata.source.fingerprint !== undefined
      ? { fingerprint: datasetMetadata.source.fingerprint }
      : {}),
  };
}

function isStoredPlannerProjectV1(value: unknown): value is StoredPlannerProjectV1 {
  if (!isPlanTransferRecord(value)) {
    return false;
  }

  const graphLayout = value['graphLayout'];
  const buildState = value['buildState'];
  return (
    readTransferString(value['id']) !== undefined &&
    readTransferString(value['name']) !== undefined &&
    readTransferString(value['datasetId']) !== undefined &&
    readTransferString(value['createdAt']) !== undefined &&
    readTransferString(value['updatedAt']) !== undefined &&
    Array.isArray(value['targets']) &&
    isPlanTransferRecord(value['recipeOverrides']) &&
    isPlanTransferRecord(value['machineOverrides']) &&
    isPlanTransferRecord(value['resourceOverrides']) &&
    isPlanTransferRecord(value['itemInputs']) &&
    isPlanTransferRecord(value['objectiveProfile']) &&
    isPlanTransferRecord(graphLayout) &&
    isPlanTransferRecord(graphLayout['nodePositions']) &&
    isPlanTransferRecord(value['graphDisplay']) &&
    isPlanTransferRecord(buildState) &&
    isPlanTransferRecord(buildState['nodeStates'])
  );
}

function fail(code: BeltwisePlanImportErrorCode, message: string): DecodeBeltwisePlanExportFailure {
  return { ok: false, error: { code, message } };
}

function hasProjectName(existingNames: readonly string[], candidate: string): boolean {
  const normalizedCandidate = normalizeProjectNameForComparison(candidate);
  return existingNames.some(
    (existingName) => normalizeProjectNameForComparison(existingName) === normalizedCandidate,
  );
}

function normalizeProjectNameForComparison(name: string): string {
  return name.trim().toLowerCase();
}
