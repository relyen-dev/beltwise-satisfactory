import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { PlannerProject } from '@beltwise/planner-core';
import { encodePlannerShareCode } from './planner-share-codec';
import { PlannerPlanTransferService } from './planner-plan-transfer.service';
import {
  PLANNER_CLIPBOARD_ADAPTER,
  PLANNER_PLAN_DOWNLOAD_ADAPTER,
  PLANNER_SHARE_LOCATION_ADAPTER,
  type PlannerClipboardAdapter,
  type PlannerPlanDownloadAdapter,
  type PlannerShareLocationAdapter,
} from './planner-transfer-browser-adapters';
import {
  PlannerStoreService,
  type PlannerPlanExportResult,
  type PlannerPlanImportResult,
  type PlannerPlanShareExportResult,
} from '../state/planner-store.service';

describe('PlannerPlanTransferService', () => {
  it('downloads exported plan JSON and reports success', () => {
    const store = createStoreHarness({
      exportActivePlan: () => ({
        ok: true,
        filename: 'iron-factory.beltwise-plan.json',
        json: '{"kind":"beltwise.plan"}',
      }),
    });
    const downloadAdapter = createDownloadAdapterHarness();
    const { service } = createServiceHarness(store, { downloadAdapter });

    expect(service.exportActivePlan()).toEqual({
      kind: 'success',
      message: 'Exported iron-factory.beltwise-plan.json.',
    });
    expect(downloadAdapter.downloadJsonFile).toHaveBeenCalledWith(
      'iron-factory.beltwise-plan.json',
      '{"kind":"beltwise.plan"}',
    );
  });

  it('copies a generated self-contained plan link', async () => {
    const store = createStoreHarness({
      exportActivePlanSharePayload: () => ({
        ok: true,
        payload: createSharePayload('Copied plan'),
      }),
    });
    const clipboardAdapter = createClipboardAdapterHarness();
    const shareLocationAdapter = createShareLocationAdapterHarness({
      createShareUrl: vi.fn((code) => `https://beltwise.test/planner#panel=plan&plan=${code}`),
    });
    const { service } = createServiceHarness(store, { clipboardAdapter, shareLocationAdapter });

    await expect(service.copyActivePlanShareLink()).resolves.toEqual({
      kind: 'success',
      message: 'Copied a self-contained plan link.',
    });
    expect(shareLocationAdapter.createShareUrl).toHaveBeenCalledOnce();
    expect(clipboardAdapter.writeText).toHaveBeenCalledOnce();
    expect(clipboardAdapter.writeText.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/beltwise\.test\/planner#panel=plan&plan=bw1\./,
    );
  });

  it('returns a file read error when selected plan JSON cannot be read', async () => {
    const store = createStoreHarness();
    const { service } = createServiceHarness(store);
    const file = {
      text: () => Promise.reject(new Error('blocked')),
    } as File;

    await expect(service.importPlanFile(file)).resolves.toEqual({
      imported: false,
      status: {
        kind: 'error',
        message: 'The selected plan file could not be read.',
      },
    });
    expect(store.importPlanJson).not.toHaveBeenCalled();
  });

  it('rejects oversized plan JSON files before reading their contents', async () => {
    const store = createStoreHarness();
    const { service } = createServiceHarness(store);
    const file = {
      size: 5_242_881,
      text: vi.fn(),
    } as unknown as File;

    await expect(service.importPlanFile(file)).resolves.toEqual({
      imported: false,
      status: {
        kind: 'error',
        message: 'The selected plan file is too large to import.',
      },
    });
    expect(file.text).not.toHaveBeenCalled();
    expect(store.importPlanJson).not.toHaveBeenCalled();
  });

  it('imports a share code and clears the plan hash after success', async () => {
    const payload = createSharePayload('Shared plan');
    const code = await encodePlannerShareCode(payload);
    const store = createStoreHarness({
      importPlanSharePayload: vi.fn(() => ({
        ok: true,
        project: { name: 'Shared plan' } as PlannerProject,
        warnings: [],
      })),
    });
    const shareLocationAdapter = createShareLocationAdapterHarness();
    const { service } = createServiceHarness(store, { shareLocationAdapter });

    await expect(service.importPlanShareCode(code, 'Shared plan link')).resolves.toEqual({
      imported: true,
      status: {
        kind: 'success',
        message: 'Imported Shared plan.',
      },
    });
    expect(store.importPlanSharePayload).toHaveBeenCalledWith(payload);
    expect(shareLocationAdapter.clearShareCode).toHaveBeenCalledOnce();
  });

  it('runs the share import preparation hook after decoding even when import is rejected', async () => {
    const payload = createSharePayload('Rejected plan');
    const code = await encodePlannerShareCode(payload);
    const beforeImport = vi.fn();
    const store = createStoreHarness({
      importPlanSharePayload: vi.fn(() => ({
        ok: false,
        message: 'Unsupported shared plan.',
      })),
    });
    const { service } = createServiceHarness(store);

    await expect(
      service.importPlanShareCode(code, 'Shared plan link', beforeImport),
    ).resolves.toEqual({
      imported: false,
      status: {
        kind: 'error',
        message: 'Unsupported shared plan.',
      },
    });
    expect(beforeImport).toHaveBeenCalledOnce();
    expect(store.importPlanSharePayload).toHaveBeenCalledWith(payload);
  });

  it('does not clear the plan hash when decoded share import is rejected', async () => {
    const payload = createSharePayload('Rejected plan');
    const code = await encodePlannerShareCode(payload);
    const shareLocationAdapter = createShareLocationAdapterHarness();
    const store = createStoreHarness({
      importPlanSharePayload: vi.fn(() => ({
        ok: false,
        message: 'Unsupported shared plan.',
      })),
    });
    const { service } = createServiceHarness(store, { shareLocationAdapter });

    await expect(service.importPlanShareCode(code, 'Shared plan link')).resolves.toEqual({
      imported: false,
      status: {
        kind: 'error',
        message: 'Unsupported shared plan.',
      },
    });
    expect(shareLocationAdapter.clearShareCode).not.toHaveBeenCalled();
  });

  it('preserves import warnings in the returned status', () => {
    const store = createStoreHarness({
      importPlanJson: vi.fn(() => ({
        ok: true,
        project: { name: 'Imported plan' } as PlannerProject,
        warnings: [{ message: 'Some recipes were unavailable.' }],
      })),
    });
    const { service } = createServiceHarness(store);

    expect(service.importPlanJson('{"kind":"beltwise.plan"}')).toEqual({
      imported: true,
      status: {
        kind: 'warning',
        message: 'Imported Imported plan. Some recipes were unavailable.',
      },
    });
  });
});

function createServiceHarness(
  store: PlannerTransferStoreHarness,
  overrides: Partial<PlannerTransferAdapterHarness> = {},
): {
  service: PlannerPlanTransferService;
} {
  const adapters: PlannerTransferAdapterHarness = {
    downloadAdapter: createDownloadAdapterHarness(),
    clipboardAdapter: createClipboardAdapterHarness(),
    shareLocationAdapter: createShareLocationAdapterHarness(),
    ...overrides,
  };
  const injector = Injector.create({
    providers: [
      PlannerPlanTransferService,
      { provide: PlannerStoreService, useValue: store },
      { provide: PLANNER_PLAN_DOWNLOAD_ADAPTER, useValue: adapters.downloadAdapter },
      { provide: PLANNER_CLIPBOARD_ADAPTER, useValue: adapters.clipboardAdapter },
      { provide: PLANNER_SHARE_LOCATION_ADAPTER, useValue: adapters.shareLocationAdapter },
    ],
  });

  return {
    service: injector.get(PlannerPlanTransferService),
  };
}

function createDownloadAdapterHarness(
  overrides: Partial<PlannerPlanDownloadAdapter> = {},
): PlannerPlanDownloadAdapterHarness {
  return {
    downloadJsonFile: vi.fn(),
    ...overrides,
  };
}

function createClipboardAdapterHarness(
  overrides: Partial<PlannerClipboardAdapter> = {},
): PlannerClipboardAdapterHarness {
  return {
    writeText: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createShareLocationAdapterHarness(
  overrides: Partial<PlannerShareLocationAdapter> = {},
): PlannerShareLocationAdapterHarness {
  return {
    createShareUrl: vi.fn((code) => `https://beltwise.test/planner#plan=${code}`),
    readShareCode: vi.fn(() => null),
    clearShareCode: vi.fn(),
    ...overrides,
  };
}

function createStoreHarness(
  overrides: Partial<PlannerTransferStoreHarness> = {},
): PlannerTransferStoreHarness {
  return {
    exportActivePlan: vi.fn(() => ({ ok: false, message: 'No plan.' })),
    exportActivePlanSharePayload: vi.fn(() => ({ ok: false, message: 'No plan.' })),
    importPlanJson: vi.fn(() => ({ ok: false, message: 'Invalid plan.' })),
    importPlanSharePayload: vi.fn(() => ({ ok: false, message: 'Invalid share.' })),
    ...overrides,
  };
}

function createSharePayload(name: string): Record<string, unknown> {
  return {
    k: 'bw.p',
    v: 1,
    d: { id: 'dataset', gameVersionLabel: 'fixture' },
    p: { n: name },
  };
}

interface PlannerTransferStoreHarness {
  exportActivePlan: () => PlannerPlanExportResult;
  exportActivePlanSharePayload: () => PlannerPlanShareExportResult;
  importPlanJson: (json: string) => PlannerPlanImportResult;
  importPlanSharePayload: (payload: unknown) => PlannerPlanImportResult;
}

interface PlannerTransferAdapterHarness {
  downloadAdapter: PlannerPlanDownloadAdapterHarness;
  clipboardAdapter: PlannerClipboardAdapterHarness;
  shareLocationAdapter: PlannerShareLocationAdapterHarness;
}

interface PlannerPlanDownloadAdapterHarness extends PlannerPlanDownloadAdapter {
  downloadJsonFile: ReturnType<typeof vi.fn>;
}

interface PlannerClipboardAdapterHarness extends PlannerClipboardAdapter {
  writeText: ReturnType<typeof vi.fn>;
}

interface PlannerShareLocationAdapterHarness extends PlannerShareLocationAdapter {
  createShareUrl: ReturnType<typeof vi.fn>;
  readShareCode: ReturnType<typeof vi.fn>;
  clearShareCode: ReturnType<typeof vi.fn>;
}
