import { InjectionToken } from '@angular/core';
import {
  clearPlannerShareCodeFromLocation,
  createPlannerShareUrl,
  readPlannerShareCodeFromLocation,
} from './planner-share-codec';

export interface PlannerPlanDownloadAdapter {
  downloadJsonFile(filename: string, json: string): void;
}

export interface PlannerClipboardAdapter {
  writeText(value: string): Promise<void>;
}

export interface PlannerShareLocationAdapter {
  createShareUrl(code: string): string;
  readShareCode(): string | null;
  clearShareCode(): void;
}

export const PLANNER_PLAN_DOWNLOAD_ADAPTER = new InjectionToken<PlannerPlanDownloadAdapter>(
  'PLANNER_PLAN_DOWNLOAD_ADAPTER',
  {
    providedIn: 'root',
    factory: () => browserPlanDownloadAdapter,
  },
);

export const PLANNER_CLIPBOARD_ADAPTER = new InjectionToken<PlannerClipboardAdapter>(
  'PLANNER_CLIPBOARD_ADAPTER',
  {
    providedIn: 'root',
    factory: () => browserClipboardAdapter,
  },
);

export const PLANNER_SHARE_LOCATION_ADAPTER = new InjectionToken<PlannerShareLocationAdapter>(
  'PLANNER_SHARE_LOCATION_ADAPTER',
  {
    providedIn: 'root',
    factory: () => browserShareLocationAdapter,
  },
);

const CLIPBOARD_TIMEOUT_MILLISECONDS = 2000;

export const browserPlanDownloadAdapter: PlannerPlanDownloadAdapter = {
  downloadJsonFile(filename, json): void {
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
  },
};

export const browserClipboardAdapter: PlannerClipboardAdapter = {
  async writeText(value): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await withTimeout(
          navigator.clipboard.writeText(value),
          'Clipboard copy timed out.',
          CLIPBOARD_TIMEOUT_MILLISECONDS,
        );
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
  },
};

export const browserShareLocationAdapter: PlannerShareLocationAdapter = {
  createShareUrl(code): string {
    return createPlannerShareUrl(code);
  },

  readShareCode(): string | null {
    return readPlannerShareCodeFromLocation();
  },

  clearShareCode(): void {
    clearPlannerShareCodeFromLocation();
  },
};

async function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMilliseconds: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMilliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
