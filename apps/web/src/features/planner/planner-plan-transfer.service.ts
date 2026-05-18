import { Injectable, inject } from '@angular/core';
import { MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES } from '@beltwise/planner-core';
import {
  clearPlannerShareCodeFromLocation,
  createPlannerShareUrl,
  decodePlannerShareCode,
  encodePlannerShareCode,
  readPlannerShareCodeFromLocation,
} from './planner-share-codec';
import { PlannerStoreService, type PlannerPlanImportResult } from './planner-store.service';

export interface PlanTransferStatus {
  kind: 'success' | 'warning' | 'error';
  message: string;
}

export interface PlanImportTransferResult {
  imported: boolean;
  status: PlanTransferStatus;
}

@Injectable({ providedIn: 'root' })
export class PlannerPlanTransferService {
  private readonly store = inject(PlannerStoreService);

  public exportActivePlan(): PlanTransferStatus {
    const result = this.store.exportActivePlan();
    if (!result.ok) {
      return errorStatus(result.message);
    }

    try {
      downloadJsonFile(result.filename, result.json);
      return successStatus(`Exported ${result.filename}.`);
    } catch {
      return errorStatus('The plan export could not be downloaded.');
    }
  }

  public async copyActivePlanShareLink(): Promise<PlanTransferStatus> {
    const result = this.store.exportActivePlanSharePayload();
    if (!result.ok) {
      return errorStatus(result.message);
    }

    try {
      const code = await withTimeout(
        encodePlannerShareCode(result.payload),
        'The plan link could not be compressed.',
      );
      await copyTextToClipboard(createPlannerShareUrl(code));
      return successStatus('Copied a self-contained plan link.');
    } catch (error) {
      return errorStatus(shareErrorMessage(error));
    }
  }

  public async importPlanFile(file: File): Promise<PlanImportTransferResult> {
    if (file.size > MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES) {
      return {
        imported: false,
        status: errorStatus('The selected plan file is too large to import.'),
      };
    }

    try {
      return this.importPlanJson(await file.text());
    } catch {
      return {
        imported: false,
        status: errorStatus('The selected plan file could not be read.'),
      };
    }
  }

  public importPlanJson(json: string): PlanImportTransferResult {
    return createImportTransferResult(this.store.importPlanJson(json));
  }

  public async importPlanShareCode(
    value: string,
    sourceLabel: string,
    beforeImport?: () => void,
  ): Promise<PlanImportTransferResult> {
    try {
      const payload = await decodePlannerShareCode(value);
      beforeImport?.();
      const result = createImportTransferResult(this.store.importPlanSharePayload(payload));
      if (result.imported) {
        clearPlannerShareCodeFromLocation();
      }
      return result;
    } catch (error) {
      return {
        imported: false,
        status: errorStatus(`${sourceLabel} could not be imported. ${shareErrorMessage(error)}`),
      };
    }
  }

  public readShareCodeFromLocation(): string | null {
    return readPlannerShareCodeFromLocation();
  }
}

function createImportTransferResult(result: PlannerPlanImportResult): PlanImportTransferResult {
  if (!result.ok) {
    return {
      imported: false,
      status: errorStatus(result.message),
    };
  }

  const datasetWarning = result.warnings[0];
  return {
    imported: true,
    status: {
      kind: datasetWarning ? 'warning' : 'success',
      message: datasetWarning
        ? `Imported ${result.project.name}. ${datasetWarning.message}`
        : `Imported ${result.project.name}.`,
    },
  };
}

function successStatus(message: string): PlanTransferStatus {
  return { kind: 'success', message };
}

function errorStatus(message: string): PlanTransferStatus {
  return { kind: 'error', message };
}

function downloadJsonFile(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await withTimeout(navigator.clipboard.writeText(value), 'Clipboard copy timed out.');
      return;
    } catch {
      // Fall back to the textarea path below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command failed');
    }
  } finally {
    textarea.remove();
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), 2000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function shareErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The plan link could not be processed.';
}
