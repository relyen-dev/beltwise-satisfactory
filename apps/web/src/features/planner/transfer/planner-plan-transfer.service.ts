import { Injectable, inject } from '@angular/core';
import { MAX_BELTWISE_PLAN_EXPORT_JSON_BYTES } from '@beltwise/planner-core';
import {
  decodePlannerShareCode,
  encodePlannerShareCode,
} from './planner-share-codec';
import {
  PLANNER_CLIPBOARD_ADAPTER,
  PLANNER_PLAN_DOWNLOAD_ADAPTER,
  PLANNER_SHARE_LOCATION_ADAPTER,
} from './planner-transfer-browser-adapters';
import {
  PLANNER_PLAN_TRANSFER_PORT,
  type PlannerPlanImportResult,
} from './planner-plan-transfer-capability';

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
  private readonly planTransfer = inject(PLANNER_PLAN_TRANSFER_PORT);
  private readonly downloadAdapter = inject(PLANNER_PLAN_DOWNLOAD_ADAPTER);
  private readonly clipboardAdapter = inject(PLANNER_CLIPBOARD_ADAPTER);
  private readonly shareLocationAdapter = inject(PLANNER_SHARE_LOCATION_ADAPTER);

  public exportActivePlan(): PlanTransferStatus {
    const result = this.planTransfer.exportActivePlan();
    if (!result.ok) {
      return errorStatus(result.message);
    }

    try {
      this.downloadAdapter.downloadJsonFile(result.filename, result.json);
      return successStatus(`Exported ${result.filename}.`);
    } catch {
      return errorStatus('The plan export could not be downloaded.');
    }
  }

  public async copyActivePlanShareLink(): Promise<PlanTransferStatus> {
    const result = this.planTransfer.exportActivePlanSharePayload();
    if (!result.ok) {
      return errorStatus(result.message);
    }

    try {
      const code = await withTimeout(
        encodePlannerShareCode(result.payload),
        'The plan link could not be compressed.',
      );
      await this.clipboardAdapter.writeText(this.shareLocationAdapter.createShareUrl(code));
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
    return createImportTransferResult(this.planTransfer.importPlanJson(json));
  }

  public async importPlanShareCode(
    value: string,
    sourceLabel: string,
    beforeImport?: () => void,
  ): Promise<PlanImportTransferResult> {
    try {
      const payload = await decodePlannerShareCode(value);
      beforeImport?.();
      const result = createImportTransferResult(this.planTransfer.importPlanSharePayload(payload));
      if (result.imported) {
        this.shareLocationAdapter.clearShareCode();
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
    return this.shareLocationAdapter.readShareCode();
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
