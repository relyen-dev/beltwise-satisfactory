import type { GameDataset } from '@beltwise/game-data';

export type BeltwisePlanImportWarningCode = 'dataset-mismatch';

export interface BeltwisePlanImportWarning {
  code: BeltwisePlanImportWarningCode;
  message: string;
  exportedDatasetId: string;
  currentDatasetId: string;
}

export interface TransferDatasetMetadata {
  id: string;
  gameVersionLabel: string;
  fingerprint?: string;
}

export function datasetImportWarnings(
  exportedDataset: TransferDatasetMetadata,
  currentDataset: GameDataset,
  sourceAction: 'exported' | 'shared',
): BeltwisePlanImportWarning[] {
  const fingerprintDiffers =
    exportedDataset.fingerprint !== undefined &&
    currentDataset.source.fingerprint !== undefined &&
    exportedDataset.fingerprint !== currentDataset.source.fingerprint;
  const metadataDiffers =
    exportedDataset.id !== currentDataset.id ||
    exportedDataset.gameVersionLabel !== currentDataset.gameVersionLabel ||
    fingerprintDiffers;

  if (!metadataDiffers) {
    return [];
  }

  return [
    {
      code: 'dataset-mismatch',
      message:
        `This plan was ${sourceAction} with dataset ${exportedDataset.id} ` +
        `(${exportedDataset.gameVersionLabel}) and was imported with the current ` +
        `dataset ${currentDataset.id} (${currentDataset.gameVersionLabel}).`,
      exportedDatasetId: exportedDataset.id,
      currentDatasetId: currentDataset.id,
    },
  ];
}
