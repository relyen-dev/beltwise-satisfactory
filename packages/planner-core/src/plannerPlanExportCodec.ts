import type { GameDataset } from '@beltwise/game-data';
import { createStableId, type PlannerProject } from './plan';
import {
  decodeStoredPlannerProject,
  encodeStoredPlannerProject,
  type StoredPlannerProjectV1,
} from './plannerPersistenceCodec';

export const BELTWISE_PLAN_EXPORT_KIND = 'beltwise.plan';
export const BELTWISE_PLAN_EXPORT_FORMAT_VERSION = 1;
export const BELTWISE_PLAN_EXPORT_SOURCE_APP = 'Beltwise';

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

export type BeltwisePlanImportWarningCode = 'dataset-mismatch';

export interface BeltwisePlanImportWarning {
  code: BeltwisePlanImportWarningCode;
  message: string;
  exportedDatasetId: string;
  currentDatasetId: string;
}

type UnknownRecord = Record<string, unknown>;

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
  if (!isRecord(value)) {
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
      return fail(
        'unsupported-version',
        'This plan was exported by a newer Beltwise format.',
      );
    }
    return fail('invalid-envelope', 'That Beltwise plan export has an invalid version.');
  }

  const exportedAt = readString(value['exportedAt']);
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
    warnings: datasetImportWarnings(datasetMetadata, dataset),
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
  if (!isRecord(value)) {
    return null;
  }

  const datasetId = readString(value['datasetId']);
  const game = value['game'];
  const gameVersionLabel = readString(value['gameVersionLabel']);
  const generatedAt = readString(value['generatedAt']);
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
  if (!isRecord(value)) {
    return null;
  }

  const docsFileName = readString(value['docsFileName']);
  if (docsFileName === undefined) {
    return null;
  }

  const docsLastModified = readString(value['docsLastModified']);
  const fingerprint = readString(value['fingerprint']);
  return {
    docsFileName,
    ...(docsLastModified !== undefined ? { docsLastModified } : {}),
    ...(fingerprint !== undefined ? { fingerprint } : {}),
  };
}

function datasetImportWarnings(
  exportedDataset: BeltwisePlanExportDatasetMetadataV1,
  currentDataset: GameDataset,
): BeltwisePlanImportWarning[] {
  const exportedFingerprint = exportedDataset.source.fingerprint;
  const currentFingerprint = currentDataset.source.fingerprint;
  const fingerprintDiffers =
    exportedFingerprint !== undefined &&
    currentFingerprint !== undefined &&
    exportedFingerprint !== currentFingerprint;
  const metadataDiffers =
    exportedDataset.datasetId !== currentDataset.id ||
    exportedDataset.gameVersionLabel !== currentDataset.gameVersionLabel ||
    fingerprintDiffers;

  if (!metadataDiffers) {
    return [];
  }

  return [
    {
      code: 'dataset-mismatch',
      message:
        `This plan was exported with dataset ${exportedDataset.datasetId} ` +
        `(${exportedDataset.gameVersionLabel}) and was imported with the current ` +
        `dataset ${currentDataset.id} (${currentDataset.gameVersionLabel}).`,
      exportedDatasetId: exportedDataset.datasetId,
      currentDatasetId: currentDataset.id,
    },
  ];
}

function isStoredPlannerProjectV1(value: unknown): value is StoredPlannerProjectV1 {
  if (!isRecord(value)) {
    return false;
  }

  const graphLayout = value['graphLayout'];
  const buildState = value['buildState'];
  return (
    readString(value['id']) !== undefined &&
    readString(value['name']) !== undefined &&
    readString(value['datasetId']) !== undefined &&
    readString(value['createdAt']) !== undefined &&
    readString(value['updatedAt']) !== undefined &&
    Array.isArray(value['targets']) &&
    isRecord(value['recipeOverrides']) &&
    isRecord(value['machineOverrides']) &&
    isRecord(value['resourceOverrides']) &&
    isRecord(value['itemInputs']) &&
    isRecord(value['objectiveProfile']) &&
    isRecord(graphLayout) &&
    isRecord(graphLayout['nodePositions']) &&
    isRecord(value['graphDisplay']) &&
    isRecord(buildState) &&
    isRecord(buildState['nodeStates'])
  );
}

function fail(
  code: BeltwisePlanImportErrorCode,
  message: string,
): DecodeBeltwisePlanExportFailure {
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
