import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlannerProject } from '@beltwise/planner-core';
import { encodePlannerShareCode } from './planner-share-codec';
import { PlannerPlanTransferService } from './planner-plan-transfer.service';
import {
  PlannerStoreService,
  type PlannerPlanExportResult,
  type PlannerPlanImportResult,
  type PlannerPlanShareExportResult,
} from '../state/planner-store.service';

describe('PlannerPlanTransferService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads exported plan JSON and reports success', () => {
    const click = vi.fn();
    const store = createStoreHarness({
      exportActivePlan: () => ({
        ok: true,
        filename: 'iron-factory.beltwise-plan.json',
        json: '{"kind":"beltwise.plan"}',
      }),
    });
    const { service } = createServiceHarness(store);
    const createObjectUrl = vi.fn(() => 'blob:plan-export');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        click,
        download: '',
        href: '',
        rel: '',
      })),
    });

    expect(service.exportActivePlan()).toEqual({
      kind: 'success',
      message: 'Exported iron-factory.beltwise-plan.json.',
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:plan-export');
  });

  it('copies a generated self-contained plan link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const store = createStoreHarness({
      exportActivePlanSharePayload: () => ({
        ok: true,
        payload: createSharePayload('Copied plan'),
      }),
    });
    const { service } = createServiceHarness(store);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('location', { href: 'https://beltwise.test/planner#panel=plan' });

    await expect(service.copyActivePlanShareLink()).resolves.toEqual({
      kind: 'success',
      message: 'Copied a self-contained plan link.',
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toMatch(
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
    const replaceState = vi.fn();
    const store = createStoreHarness({
      importPlanSharePayload: vi.fn(() => ({
        ok: true,
        project: { name: 'Shared plan' } as PlannerProject,
        warnings: [],
      })),
    });
    const { service } = createServiceHarness(store);
    vi.stubGlobal('location', {
      hash: `#panel=plan&plan=${code}`,
      href: `https://beltwise.test/planner#panel=plan&plan=${code}`,
    });
    vi.stubGlobal('history', {
      replaceState,
      state: { source: 'test' },
    });

    await expect(service.importPlanShareCode(code, 'Shared plan link')).resolves.toEqual({
      imported: true,
      status: {
        kind: 'success',
        message: 'Imported Shared plan.',
      },
    });
    expect(store.importPlanSharePayload).toHaveBeenCalledWith(payload);
    expect(replaceState).toHaveBeenCalledWith(
      { source: 'test' },
      '',
      'https://beltwise.test/planner#panel=plan',
    );
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

function createServiceHarness(store: PlannerTransferStoreHarness): {
  service: PlannerPlanTransferService;
} {
  const injector = Injector.create({
    providers: [PlannerPlanTransferService, { provide: PlannerStoreService, useValue: store }],
  });

  return {
    service: injector.get(PlannerPlanTransferService),
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
