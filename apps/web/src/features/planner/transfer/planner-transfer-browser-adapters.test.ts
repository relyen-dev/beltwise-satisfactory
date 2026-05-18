import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserClipboardAdapter,
  browserPlanDownloadAdapter,
  browserShareLocationAdapter,
} from './planner-transfer-browser-adapters';

describe('planner transfer browser adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads JSON with an object URL and revokes it after clicking the link', () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:plan-export');
    const revokeObjectURL = vi.fn();
    const createElement = vi.fn(() => createAnchorElement({ click }));
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { createElement });

    browserPlanDownloadAdapter.downloadJsonFile(
      'iron-factory.beltwise-plan.json',
      '{"kind":"beltwise.plan"}',
    );

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createElement).toHaveBeenCalledWith('a');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:plan-export');
  });

  it('revokes the object URL when download click fails', () => {
    const createObjectURL = vi.fn(() => 'blob:plan-export');
    const revokeObjectURL = vi.fn();
    const click = vi.fn(() => {
      throw new Error('blocked');
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => createAnchorElement({ click })),
    });

    expect(() =>
      browserPlanDownloadAdapter.downloadJsonFile(
        'iron-factory.beltwise-plan.json',
        '{"kind":"beltwise.plan"}',
      ),
    ).toThrow('blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:plan-export');
  });

  it('writes clipboard text through navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(browserClipboardAdapter.writeText('https://beltwise.test/share')).resolves.toBe(
      undefined,
    );

    expect(writeText).toHaveBeenCalledWith('https://beltwise.test/share');
  });

  it('falls back to textarea copy when navigator clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    const textarea = createTextareaElement();
    const bodyAppend = vi.fn();
    const execCommand = vi.fn(() => true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', {
      body: { append: bodyAppend },
      createElement: vi.fn(() => textarea),
      execCommand,
    });

    await expect(browserClipboardAdapter.writeText('beltwise-share-code')).resolves.toBe(
      undefined,
    );

    expect(writeText).toHaveBeenCalledWith('beltwise-share-code');
    expect(textarea.value).toBe('beltwise-share-code');
    expect(bodyAppend).toHaveBeenCalledWith(textarea);
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
  });

  it('falls back to textarea copy when navigator clipboard is absent', async () => {
    const textarea = createTextareaElement();
    const execCommand = vi.fn(() => true);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      body: { append: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand,
    });

    await browserClipboardAdapter.writeText('beltwise-share-code');

    expect(textarea.value).toBe('beltwise-share-code');
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('wires share URL creation, reading, and clearing through location helpers', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', {
      hash: '#panel=plan&plan=bw1.example',
      href: 'https://beltwise.test/planner#panel=plan&plan=bw1.example',
    });
    vi.stubGlobal('history', {
      replaceState,
      state: { source: 'test' },
    });

    expect(browserShareLocationAdapter.createShareUrl('bw1.next')).toBe(
      'https://beltwise.test/planner#panel=plan&plan=bw1.next',
    );
    expect(browserShareLocationAdapter.readShareCode()).toBe('bw1.example');

    browserShareLocationAdapter.clearShareCode();

    expect(replaceState).toHaveBeenCalledWith(
      { source: 'test' },
      '',
      'https://beltwise.test/planner#panel=plan',
    );
  });
});

function createAnchorElement(overrides: Partial<HTMLAnchorElement> = {}): HTMLAnchorElement {
  return {
    click: vi.fn(),
    download: '',
    href: '',
    rel: '',
    ...overrides,
  } as HTMLAnchorElement;
}

function createTextareaElement(): HTMLTextAreaElement {
  return {
    remove: vi.fn(),
    select: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
    value: '',
  } as unknown as HTMLTextAreaElement;
}
