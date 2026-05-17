import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerProject, PlannerSession } from '@beltwise/planner-core';
import { PlannerPageComponent } from './planner-page.component';
import {
  PlannerStoreService,
  type ConfigurationTab,
  type WorkbenchFocusRequest,
} from './planner-store.service';
import { encodePlannerShareCode } from './planner-share-codec';

describe('PlannerPageComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLElement', TestHTMLElement);
    vi.stubGlobal('HTMLInputElement', TestHTMLInputElement);
    vi.stubGlobal('document', { activeElement: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a workbench section and closes it when the active open section is requested again', () => {
    const { component, store } = createComponentHarness();

    component.openSection('recipes');

    expect(store.activeConfigTab()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(true);

    component.openSection('recipes');

    expect(store.activeConfigTab()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(false);
  });

  it('clears graph selection from Escape when focus is not editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(clearSelectedGraphNode).toHaveBeenCalledOnce();
    expect(store.selectedGraphNodeId()).toBeNull();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not clear graph selection from Escape when focus is editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    const editableTargets = [
      new TestHTMLElement('input'),
      new TestHTMLElement('textarea'),
      new TestHTMLElement('select'),
      new TestHTMLElement('div', { isContentEditable: true }),
    ];

    for (const target of editableTargets) {
      const event = keyboardEvent(target);

      component.clearGraphSelectionFromKeyboard(event);

      expect(clearSelectedGraphNode).not.toHaveBeenCalled();
      expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('closes the defaults panel from Escape before clearing graph selection', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(component.defaultsPanelOpen()).toBe(false);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('keeps the defaults panel open from Escape when focus is editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('input'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(component.defaultsPanelOpen()).toBe(true);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('flushes graph node positions before unloading', () => {
    const { component, flushGraphNodePositions } = createComponentHarness();

    component.flushGraphNodePositionsBeforeUnload();

    expect(flushGraphNodePositions).toHaveBeenCalledOnce();
  });

  it('deletes a draft-only session without confirmation', () => {
    const { component, deleteSession } = createComponentHarness();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    component.deleteActiveSession();

    expect(confirm).not.toHaveBeenCalled();
    expect(deleteSession).toHaveBeenCalledWith('session-a');
  });

  it('confirms before deleting a session with configured plans', () => {
    const { component, deleteSession, store } = createComponentHarness();
    store.activeSessionProjects.set([
      createPageProject('project-a', 'Factory', [
        {
          id: 'target-a',
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ]),
    ]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    component.deleteActiveSession();

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteSession).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    component.deleteActiveSession();

    expect(deleteSession).toHaveBeenCalledWith('session-a');
  });

  it('deletes a draft plan without confirmation', () => {
    const { component, deleteProject } = createComponentHarness();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    component.deleteActiveProject();

    expect(confirm).not.toHaveBeenCalled();
    expect(deleteProject).toHaveBeenCalledOnce();
  });

  it('confirms before deleting a plan with configured target items', () => {
    const { component, deleteProject, store } = createComponentHarness();
    store.activeProject.set(
      createPageProject('project-a', 'Factory', [
        {
          id: 'target-a',
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ]),
    );
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    component.deleteActiveProject();

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteProject).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    component.deleteActiveProject();

    expect(deleteProject).toHaveBeenCalledOnce();
  });

  it('copies a self-contained plan link and reports success', async () => {
    const { component, exportActivePlanSharePayload } = createComponentHarness();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('location', { href: 'https://beltwise.test/planner#panel=plan' });

    await component.copyActivePlanShareLink();

    expect(exportActivePlanSharePayload).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toMatch(/^https:\/\/beltwise\.test\/planner#panel=plan&plan=bw1\./);
    expect(component.planTransferStatus()).toEqual({
      kind: 'success',
      message: 'Copied a self-contained plan link.',
    });
  });

  it('imports a pasted plan link or code and closes the paste panel', async () => {
    const { component, importPlanSharePayload } = createComponentHarness();
    const payload = createSharePayload('Pasted plan');
    const code = await encodePlannerShareCode(payload);
    component.shareImportOpen.set(true);
    component.shareCodeText.set(code);

    await component.importPlanShareCodeInput();

    expect(importPlanSharePayload).toHaveBeenCalledWith(payload);
    expect(component.shareImportOpen()).toBe(false);
    expect(component.shareCodeText()).toBe('');
    expect(component.planTransferStatus()).toEqual({
      kind: 'success',
      message: 'Imported Pasted plan.',
    });
  });

  it('imports a selected plan file and reports status', async () => {
    const { component, importPlanJson } = createComponentHarness();
    const input = new TestHTMLInputElement('input');
    input.value = 'C:\\fakepath\\plan.json';
    input.files = {
      item: () => ({
        text: () => Promise.resolve('{"kind":"beltwise.plan"}'),
      }),
    };

    await component.importPlanFile({ target: input } as unknown as Event);

    expect(importPlanJson).toHaveBeenCalledWith('{"kind":"beltwise.plan"}');
    expect(input.value).toBe('');
    expect(component.planTransferStatus()).toEqual({
      kind: 'success',
      message: 'Imported File plan.',
    });
  });
});

function createComponentHarness(): {
  clearSelectedGraphNode: ReturnType<typeof vi.fn>;
  component: PlannerPageComponent;
  deleteProject: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  exportActivePlanSharePayload: ReturnType<typeof vi.fn>;
  flushGraphNodePositions: ReturnType<typeof vi.fn>;
  importPlanJson: ReturnType<typeof vi.fn>;
  importPlanSharePayload: ReturnType<typeof vi.fn>;
  store: PlannerPageStoreHarness;
} {
  const clearSelectedGraphNode = vi.fn();
  const deleteProject = vi.fn();
  const deleteSession = vi.fn();
  const exportActivePlanSharePayload = vi.fn(() => ({
    ok: true,
    payload: createSharePayload('Copied plan'),
  }));
  const flushGraphNodePositions = vi.fn();
  const importPlanJson = vi.fn(() => ({
    ok: true,
    project: { name: 'File plan' },
    warnings: [],
  }));
  const importPlanSharePayload = vi.fn((_payload: unknown) => ({
    ok: true,
    project: { name: 'Pasted plan' },
    warnings: [],
  }));
  const store: PlannerPageStoreHarness = {
    activeProject: signal<PlannerProject | null>(
      createPageProject('project-a', 'Draft factory', []),
    ),
    activeProjectId: signal<string | undefined>('project-a'),
    activeSession: signal<PlannerSession | null>({
      id: 'session-a',
      name: 'Default session',
    } as PlannerSession),
    activeSessionProjects: signal<PlannerProject[]>([
      createPageProject('project-a', 'Draft factory', []),
    ]),
    activeConfigTab: signal<ConfigurationTab>('plan'),
    clearSelectedGraphNode: () => {
      clearSelectedGraphNode();
      store.selectedGraphNodeId.set(null);
    },
    dataset: signal({ id: 'dataset' }),
    deleteProject,
    deleteSession,
    exportActivePlanSharePayload,
    flushGraphNodePositions,
    importPlanJson,
    importPlanSharePayload,
    selectedGraphNodeId: signal<string | null>('recipe:Recipe_IronPlate_C'),
    workbenchFocusRequest: signal<WorkbenchFocusRequest | null>(null),
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerStoreService, useValue: store }],
  });
  const component = runInInjectionContext(injector, () => new PlannerPageComponent());

  return {
    clearSelectedGraphNode,
    component,
    deleteProject,
    deleteSession,
    exportActivePlanSharePayload,
    flushGraphNodePositions,
    importPlanJson,
    importPlanSharePayload,
    store,
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

function keyboardEvent(target: TestHTMLElement): KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    preventDefault: vi.fn(),
    target,
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

interface PlannerPageStoreHarness {
  activeConfigTab: WritableSignal<ConfigurationTab>;
  activeProject: WritableSignal<PlannerProject | null>;
  activeProjectId: WritableSignal<string | undefined>;
  activeSession: WritableSignal<PlannerSession | null>;
  activeSessionProjects: WritableSignal<PlannerProject[]>;
  clearSelectedGraphNode: () => void;
  dataset: WritableSignal<{ id: string } | null>;
  deleteProject: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  exportActivePlanSharePayload: ReturnType<typeof vi.fn>;
  flushGraphNodePositions: () => void;
  importPlanJson: ReturnType<typeof vi.fn>;
  importPlanSharePayload: ReturnType<typeof vi.fn>;
  selectedGraphNodeId: WritableSignal<string | null>;
  workbenchFocusRequest: WritableSignal<WorkbenchFocusRequest | null>;
}

function createPageProject(
  id: string,
  name: string,
  targets: PlannerProject['targets'],
): PlannerProject {
  return {
    id,
    name,
    targets,
  } as PlannerProject;
}

class TestHTMLElement {
  public readonly tagName: string;
  public readonly isContentEditable: boolean;

  public constructor(tagName: string, options: { isContentEditable?: boolean } = {}) {
    this.tagName = tagName.toUpperCase();
    this.isContentEditable = options.isContentEditable ?? false;
  }

  public blur(): void {
    return undefined;
  }

  public closest(_selector: string): TestHTMLElement | null {
    return null;
  }
}

class TestHTMLInputElement extends TestHTMLElement {
  public files: {
    item: (index: number) => { text: () => Promise<string> } | null;
  } | null = null;
  public value = '';
}
