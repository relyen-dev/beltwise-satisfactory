import '@angular/compiler';
import {
  Injector,
  runInInjectionContext,
  signal,
  type ElementRef,
  type WritableSignal,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PLANNER_NAME_LENGTH,
  type PlannerProject,
  type PlannerSession,
  type ProductionPlanStatus,
} from '@beltwise/planner-core';
import { ApplicationUpdateNoticeService } from '../../app/application-update-notice.service';
import { PlannerPageComponent } from './planner-page.component';
import { PlannerPlanTransferService } from './transfer/planner-plan-transfer.service';
import {
  PLANNER_CLIPBOARD_ADAPTER,
  PLANNER_PLAN_DOWNLOAD_ADAPTER,
  PLANNER_SHARE_LOCATION_ADAPTER,
  type PlannerClipboardAdapter,
  type PlannerPlanDownloadAdapter,
  type PlannerShareLocationAdapter,
} from './transfer/planner-transfer-browser-adapters';
import { PlannerStoreService } from './state/planner-store.service';
import { PlannerGraphStore } from './state/planner-graph.store';
import { PlannerPlanConfigStore } from './state/planner-plan-config.store';
import { PlannerWorkspaceSlice } from './state/planner-store.workspace';
import { DatasetService } from './dataset.service';
import { PlannerSolverService } from './solving/planner-solver.service';
import { encodePlannerShareCode } from './transfer/planner-share-codec';
import { PLANNER_PLAN_TRANSFER_PORT } from './transfer/planner-plan-transfer-capability';
import { type WorkbenchPanelId } from './workbench/planner-workbench.models';
import { PlannerWorkbenchSlice } from './workbench/planner-workbench-state';

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
    const { component, workbench } = createComponentHarness();

    component.openSection('recipes');

    expect(workbench.activePanelId()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(true);

    component.openSection('recipes');

    expect(workbench.activePanelId()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(false);
  });

  it('collapses and reopens the inspector panel', () => {
    const { component } = createComponentHarness();

    component.collapseInspectorPanel();

    expect(component.inspectorPanelOpen()).toBe(false);

    component.openInspectorPanel();

    expect(component.inspectorPanelOpen()).toBe(true);
  });

  it('clears graph selection from Escape when focus is not editable', () => {
    const { component, graph, clearSelectedGraphNode } = createComponentHarness();
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.handleEscapeKey(event);

    expect(clearSelectedGraphNode).toHaveBeenCalledOnce();
    expect(graph.readModel.selectedNodeId()).toBeNull();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not clear graph selection from Escape when focus is editable', () => {
    const { component, graph, clearSelectedGraphNode } = createComponentHarness();
    const editableTargets = [
      new TestHTMLElement('input'),
      new TestHTMLElement('textarea'),
      new TestHTMLElement('select'),
      new TestHTMLElement('div', { isContentEditable: true }),
    ];

    for (const target of editableTargets) {
      const event = keyboardEvent(target);

      component.handleEscapeKey(event);

      expect(clearSelectedGraphNode).not.toHaveBeenCalled();
      expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('closes the defaults panel from Escape before clearing graph selection', () => {
    const { component, graph, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.handleEscapeKey(event);

    expect(component.defaultsPanelOpen()).toBe(false);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('keeps the defaults panel open from Escape when focus is editable', () => {
    const { component, graph, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('input'));

    component.handleEscapeKey(event);

    expect(component.defaultsPanelOpen()).toBe(true);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('flushes graph node positions before unloading', () => {
    const { component, flushGraphNodePositions } = createComponentHarness();

    component.flushGraphNodePositionsBeforeUnload();

    expect(flushGraphNodePositions).toHaveBeenCalledOnce();
  });

  it('saves inline renames while the edited entity is still active', () => {
    const { component, renameProject, renameSession } = createComponentHarness();
    component.startProjectNameEdit('project-a', 'Draft factory');
    component.projectNameDraft.set('Renamed factory');

    component.saveProjectNameEdit();

    expect(renameProject).toHaveBeenCalledWith('Renamed factory');
    expect(component.projectNameEditing()).toBe(false);

    component.startSessionNameEdit('session-a', 'Default session');
    component.sessionNameDraft.set('Rocky Desert');

    component.saveSessionNameEdit();

    expect(renameSession).toHaveBeenCalledWith('Rocky Desert');
    expect(component.sessionNameEditing()).toBe(false);
  });

  it('normalizes long inline rename drafts before saving', () => {
    const { component, renameProject, renameSession } = createComponentHarness();
    const longName = 'A'.repeat(MAX_PLANNER_NAME_LENGTH + 20);
    component.startProjectNameEdit('project-a', 'Draft factory');
    component.projectNameDraft.set(` ${longName}\nignored tail `);

    component.saveProjectNameEdit();

    expect(renameProject).toHaveBeenCalledWith('A'.repeat(MAX_PLANNER_NAME_LENGTH));

    component.startSessionNameEdit('session-a', 'Default session');
    component.sessionNameDraft.set(` ${longName}\nignored tail `);

    component.saveSessionNameEdit();

    expect(renameSession).toHaveBeenCalledWith('A'.repeat(MAX_PLANNER_NAME_LENGTH));
  });

  it('does not save a plan rename after the active project changes', () => {
    const { component, renameProject, workspace } = createComponentHarness();
    component.startProjectNameEdit('project-a', 'Draft factory');
    component.projectNameDraft.set('Renamed factory');
    workspace.activeProjectId.set('project-b');

    component.saveProjectNameEdit();

    expect(renameProject).not.toHaveBeenCalled();
    expect(component.projectNameEditing()).toBe(false);
  });

  it('does not save a session rename after the active session changes', () => {
    const { component, renameSession, workspace } = createComponentHarness();
    component.startSessionNameEdit('session-a', 'Default session');
    component.sessionNameDraft.set('Rocky Desert');
    workspace.activeSessionId.set('session-b');

    component.saveSessionNameEdit();

    expect(renameSession).not.toHaveBeenCalled();
    expect(component.sessionNameEditing()).toBe(false);
  });

  it('moves focus into rename fields and selects the session name after activation', () => {
    const { component } = createComponentHarness();
    const projectFocus = vi.fn();
    const sessionFocus = vi.fn();
    const sessionSelect = vi.fn();
    stubInputViewChild(component, 'projectNameInput', projectFocus);
    stubInputViewChild(component, 'sessionNameInput', sessionFocus, sessionSelect);
    vi.useFakeTimers();

    try {
      component.startProjectNameEdit('project-a', 'Draft factory');
      vi.runOnlyPendingTimers();

      expect(projectFocus).toHaveBeenCalledOnce();

      component.startSessionNameEdit('session-a', 'Default session');
      vi.runOnlyPendingTimers();

      expect(sessionFocus).toHaveBeenCalledOnce();
      expect(sessionSelect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears inline edits before active-changing commands', () => {
    const {
      component,
      createProject,
      createSession,
      duplicateProject,
      selectProject,
      selectSession,
    } = createComponentHarness();
    component.startProjectNameEdit('project-a', 'Draft factory');

    component.createProject();

    expect(createProject).toHaveBeenCalledOnce();
    expect(component.projectNameEditing()).toBe(false);

    component.startProjectNameEdit('project-a', 'Draft factory');

    component.duplicateProject();

    expect(duplicateProject).toHaveBeenCalledOnce();
    expect(component.projectNameEditing()).toBe(false);

    component.startProjectNameEdit('project-a', 'Draft factory');

    component.selectProject('project-b');

    expect(selectProject).toHaveBeenCalledWith('project-b');
    expect(component.projectNameEditing()).toBe(false);

    component.startSessionNameEdit('session-a', 'Default session');

    component.createSession();

    expect(createSession).toHaveBeenCalledOnce();
    expect(component.sessionNameEditing()).toBe(false);

    component.startSessionNameEdit('session-a', 'Default session');

    component.selectSession('session-b');

    expect(selectSession).toHaveBeenCalledWith('session-b');
    expect(component.sessionNameEditing()).toBe(false);
  });

  it('lists all plans in the active plan selector and switches from it', () => {
    const { component, selectProject, workspace } = createComponentHarness();
    const projects = createPageProjectList(7);
    workspace.activeSessionProjects.set(projects);
    workspace.activeProjectId.set('project-4');

    component.openPlanSelector();

    expect(component.planSelectorOpen()).toBe(true);
    expect(component.planDockItems().map((plan) => plan.id)).toEqual([
      'project-1',
      'project-2',
      'project-3',
      'project-4',
      'project-5',
      'project-6',
      'project-7',
    ]);

    component.selectProjectFromSelector('project-7');

    expect(selectProject).toHaveBeenCalledWith('project-7');
    expect(component.planSelectorOpen()).toBe(false);
  });

  it('focuses the active plan option when opening the selector', () => {
    const { component, workspace } = createComponentHarness();
    const firstFocus = vi.fn();
    const activeFocus = vi.fn();
    workspace.activeSessionProjects.set(createPageProjectList(2));
    workspace.activeProjectId.set('project-2');
    stubElementViewChildren(component, 'planSelectorOptions', [firstFocus, activeFocus]);
    vi.useFakeTimers();

    try {
      component.openPlanSelector();
      vi.runOnlyPendingTimers();

      expect(firstFocus).not.toHaveBeenCalled();
      expect(activeFocus).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the visible plan strip bounded around recently touched plans', () => {
    const { component, selectProject, workspace } = createComponentHarness();
    workspace.activeSessionProjects.set(createPageProjectList(8));
    workspace.activeProjectId.set('project-5');

    component.selectProject('project-2');
    component.selectProject('project-7');
    component.selectProject('project-3');

    expect(component.visiblePlanDockItems().map((plan) => plan.id)).toEqual([
      'project-3',
      'project-7',
      'project-2',
      'project-1',
      'project-4',
      'project-5',
    ]);
    expect(component.visiblePlanDockItems()).toHaveLength(6);

    component.openPlanSelector();
    component.selectProjectFromSelector('project-1');

    expect(selectProject).toHaveBeenLastCalledWith('project-1');
  });

  it('keeps create plan available beside the active selector when many plans exist', () => {
    const { component, createProject, workspace } = createComponentHarness();
    workspace.activeSessionProjects.set(createPageProjectList(10));
    workspace.activeProjectId.set('project-10');
    component.openPlanSelector();

    component.createProject();

    expect(createProject).toHaveBeenCalledOnce();
    expect(component.planSelectorOpen()).toBe(false);
    expect(component.visiblePlanDockItems()).toHaveLength(6);
  });

  it('keeps active plan reselection as a navigation no-op', () => {
    const { component, graph, selectProject } = createComponentHarness();
    component.openPlanSelector();
    component.actionMenuOpen.set(true);

    component.selectProject('project-a');

    expect(selectProject).not.toHaveBeenCalled();
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(component.planSelectorOpen()).toBe(false);
    expect(component.actionMenuOpen()).toBe(false);
  });

  it('closes the selector without reactivating when choosing the active plan option', () => {
    const { component, graph, selectProject } = createComponentHarness();
    component.openPlanSelector();

    component.selectProjectFromSelector('project-a');

    expect(selectProject).not.toHaveBeenCalled();
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(component.planSelectorOpen()).toBe(false);
  });

  it('closes the active plan selector from Escape before graph selection handling', () => {
    const { clearSelectedGraphNode, component, graph } = createComponentHarness();
    const focus = vi.fn();
    stubElementViewChild(component, 'activePlanTrigger', focus);
    vi.useFakeTimers();
    component.openPlanSelector();
    const event = keyboardEvent(new TestHTMLElement('div'));

    try {
      component.handleEscapeKey(event);
      vi.runOnlyPendingTimers();

      expect(component.planSelectorOpen()).toBe(false);
      expect(clearSelectedGraphNode).not.toHaveBeenCalled();
      expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the actions menu from Escape before graph selection handling', () => {
    const { clearSelectedGraphNode, component, graph } = createComponentHarness();
    const focus = vi.fn();
    stubElementViewChild(component, 'actionMenuSummary', focus);
    component.actionMenuOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('div'));
    vi.useFakeTimers();

    try {
      component.handleEscapeKey(event);
      vi.runOnlyPendingTimers();

      expect(component.actionMenuOpen()).toBe(false);
      expect(clearSelectedGraphNode).not.toHaveBeenCalled();
      expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs the actions menu with the native details open state', () => {
    const { component } = createComponentHarness();
    const details = new TestDetailsElement();
    component.openPlanSelector();

    details.open = true;
    component.syncActionMenuOpen({ currentTarget: details } as unknown as Event);
    expect(component.actionMenuOpen()).toBe(true);
    expect(component.planSelectorOpen()).toBe(false);

    details.open = false;
    component.syncActionMenuOpen({ currentTarget: details } as unknown as Event);
    expect(component.actionMenuOpen()).toBe(false);
  });

  it('shows graph solve notices only for pending or problem states', () => {
    const { component, solver } = createComponentHarness();

    expect(component.graphSolveNotice()).toBeNull();
    expect(component.graphBlockingNotice()).toBeNull();

    solver.solveStatus.set('solving');
    expect(component.graphSolveNotice()).toEqual({ kind: 'info', message: 'Solving plan' });
    expect(component.graphBlockingNotice()).toBeNull();

    solver.solveStatus.set('error');
    solver.solveError.set('LP failed');
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan calculation failed',
    });
    expect(component.graphBlockingNotice()).toEqual({
      title: 'Plan calculation failed',
      detail: 'The planner could not finish calculating this plan.',
    });

    solver.solveStatus.set('solved');
    solver.solveError.set(null);
    solver.solveResult.set({ status: 'infeasible' });
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan cannot be built',
    });
    expect(component.graphBlockingNotice()).toEqual({
      title: 'Plan cannot be built',
      detail:
        'The requested outputs cannot be made with the current recipes, available raw resources, and Inputs. Add supplied items or relax disabled recipes and resources.',
    });

    solver.solveStatus.set('solving');
    expect(component.graphSolveNotice()).toEqual({ kind: 'info', message: 'Solving plan' });
    expect(component.graphBlockingNotice()).toBeNull();

    solver.solveStatus.set('solved');
    solver.solveResult.set({ status: 'unbounded' });
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan needs a limit',
    });

    solver.solveResult.set({ status: 'error' });
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan calculation failed',
    });
    expect(component.graphBlockingNotice()).toEqual({
      title: 'Plan calculation failed',
      detail: 'The planner could not finish calculating this plan.',
    });

    solver.solveResult.set({
      status: 'error',
      warnings: [{ message: 'HiGHS returned an error' }],
    });
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan calculation failed',
    });
    expect(component.graphBlockingNotice()).toEqual({
      title: 'Plan calculation failed',
      detail: 'The planner could not finish calculating this plan.',
    });

    solver.solveResult.set({ status: 'error', warnings: [{ message: '   ' }] });
    expect(component.graphSolveNotice()).toEqual({
      kind: 'error',
      message: 'Plan calculation failed',
    });
  });

  it('cancels inline renames from Escape before graph selection handling', () => {
    const { clearSelectedGraphNode, component, graph } = createComponentHarness();
    component.startProjectNameEdit('project-a', 'Draft factory');
    const event = keyboardEvent(new TestHTMLElement('input'));

    component.handleEscapeKey(event);

    expect(component.projectNameEditing()).toBe(false);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).toHaveBeenCalledOnce();
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
    const { component, deleteSession, workspace } = createComponentHarness();
    workspace.activeSessionProjects.set([
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
    const { component, deleteProject, workspace } = createComponentHarness();
    workspace.activeProject.set(
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
    const { clipboardAdapter, component, exportActivePlanSharePayload } = createComponentHarness();

    await component.copyActivePlanShareLink();

    expect(exportActivePlanSharePayload).toHaveBeenCalledOnce();
    expect(clipboardAdapter.writeText).toHaveBeenCalledOnce();
    const copied = clipboardAdapter.writeText.mock.calls[0]?.[0] as string;
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
    component.startSessionNameEdit('session-a', 'Default session');

    await component.importPlanShareCodeInput();

    expect(importPlanSharePayload).toHaveBeenCalledWith(payload);
    expect(component.shareImportOpen()).toBe(false);
    expect(component.shareCodeText()).toBe('');
    expect(component.sessionNameEditing()).toBe(false);
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
    component.startProjectNameEdit('project-a', 'Draft factory');

    await component.importPlanFile({ target: input } as unknown as Event);

    expect(importPlanJson).toHaveBeenCalledWith('{"kind":"beltwise.plan"}');
    expect(input.value).toBe('');
    expect(component.projectNameEditing()).toBe(false);
    expect(component.planTransferStatus()).toEqual({
      kind: 'success',
      message: 'Imported File plan.',
    });
  });
});

function createComponentHarness(): {
  clipboardAdapter: PlannerPageClipboardAdapterHarness;
  clearSelectedGraphNode: ReturnType<typeof vi.fn>;
  component: PlannerPageComponent;
  createProject: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  duplicateProject: ReturnType<typeof vi.fn>;
  exportActivePlan: ReturnType<typeof vi.fn>;
  exportActivePlanSharePayload: ReturnType<typeof vi.fn>;
  flushGraphNodePositions: ReturnType<typeof vi.fn>;
  graph: PlannerPageGraphHarness;
  importPlanJson: ReturnType<typeof vi.fn>;
  importPlanSharePayload: ReturnType<typeof vi.fn>;
  renameProject: ReturnType<typeof vi.fn>;
  renameSession: ReturnType<typeof vi.fn>;
  shareLocationAdapter: PlannerPageShareLocationAdapterHarness;
  selectProject: ReturnType<typeof vi.fn>;
  selectSession: ReturnType<typeof vi.fn>;
  solver: PlannerPageSolverHarness;
  workbench: PlannerPageWorkbenchHarness;
  workspace: PlannerPageWorkspaceHarness;
} {
  const clearSelectedGraphNode = vi.fn();
  const createProject = vi.fn();
  const createSession = vi.fn();
  const deleteProject = vi.fn();
  const deleteSession = vi.fn();
  const duplicateProject = vi.fn();
  const exportActivePlan = vi.fn(() => ({
    ok: true,
    filename: 'beltwise-factory.json',
    json: '{"kind":"beltwise.plan"}',
  }));
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
  const clipboardAdapter: PlannerPageClipboardAdapterHarness = {
    writeText: vi.fn().mockResolvedValue(undefined),
  };
  const downloadAdapter: PlannerPlanDownloadAdapter = {
    downloadJsonFile: vi.fn(),
  };
  const shareLocationAdapter: PlannerPageShareLocationAdapterHarness = {
    createShareUrl: vi.fn(
      (code: string) => `https://beltwise.test/planner#panel=plan&plan=${code}`,
    ),
    readShareCode: vi.fn(() => null),
    clearShareCode: vi.fn(),
  };
  const renameProject = vi.fn();
  const renameSession = vi.fn();
  const graph: PlannerPageGraphHarness = {
    readModel: {
      selectedNodeId: signal<string | null>('recipe:Recipe_IronPlate_C'),
    },
    selectionCommands: {
      clear: () => {
        clearSelectedGraphNode();
        graph.readModel.selectedNodeId.set(null);
      },
    },
    layoutCommands: {
      cancelNodePositions: vi.fn(),
      flushNodePositions: flushGraphNodePositions,
    },
  };
  const planConfig: PlannerPagePlanConfigHarness = {
    targetCommands: {
      updateAmount: vi.fn(),
    },
  };
  let workspace: PlannerPageWorkspaceHarness;
  const selectProject = vi.fn((projectId: string) => {
    workspace.activeProjectId.set(projectId);
    workspace.activeProject.set(
      workspace.activeSessionProjects().find((project) => project.id === projectId) ?? null,
    );
  });
  const selectSession = vi.fn();
  const datasetService: PlannerPageDatasetHarness = {
    dataset: signal({ id: 'dataset' }),
    loadError: signal<string | null>(null),
  };
  const solver: PlannerPageSolverHarness = {
    solveError: signal<string | null>(null),
    solveResult: signal<PlannerPageSolveResult | null>({ status: 'optimal' }),
    solveStatus: signal<'idle' | 'solving' | 'solved' | 'error'>('solved'),
  };
  const workbench: PlannerPageWorkbenchHarness = {
    activePanelId: signal<WorkbenchPanelId>('plan'),
    focusRequest: signal(null),
    setActivePanel: (panelId: WorkbenchPanelId) => {
      workbench.activePanelId.set(panelId);
    },
  };
  workspace = {
    activeProject: signal<PlannerProject | null>(
      createPageProject('project-a', 'Draft factory', []),
    ),
    activeProjectId: signal<string | undefined>('project-a'),
    activeSession: signal<PlannerSession | null>({
      id: 'session-a',
      name: 'Default session',
    } as PlannerSession),
    activeSessionId: signal<string | undefined>('session-a'),
    activeSessionProjects: signal<PlannerProject[]>([
      createPageProject('project-a', 'Draft factory', []),
    ]),
    createProject,
    createSession,
    deleteProject,
    deleteSession,
    duplicateProject,
    renameProject,
    renameSession,
    selectProject,
    selectSession,
  };
  const injector = Injector.create({
    providers: [
      PlannerPlanTransferService,
      { provide: PlannerStoreService, useValue: {} },
      { provide: DatasetService, useValue: datasetService },
      { provide: PlannerSolverService, useValue: solver },
      { provide: PlannerWorkbenchSlice, useValue: workbench },
      { provide: PlannerWorkspaceSlice, useValue: workspace },
      {
        provide: PLANNER_PLAN_TRANSFER_PORT,
        useValue: {
          exportActivePlan,
          exportActivePlanSharePayload,
          importPlanJson,
          importPlanSharePayload,
        },
      },
      { provide: PlannerGraphStore, useValue: graph },
      { provide: PlannerPlanConfigStore, useValue: planConfig },
      {
        provide: ApplicationUpdateNoticeService,
        useValue: { notifyIfApplicationUpdateError: vi.fn(() => false) },
      },
      { provide: PLANNER_CLIPBOARD_ADAPTER, useValue: clipboardAdapter },
      { provide: PLANNER_PLAN_DOWNLOAD_ADAPTER, useValue: downloadAdapter },
      { provide: PLANNER_SHARE_LOCATION_ADAPTER, useValue: shareLocationAdapter },
    ],
  });
  const component = runInInjectionContext(injector, () => new PlannerPageComponent());

  return {
    clipboardAdapter,
    clearSelectedGraphNode,
    component,
    createProject,
    createSession,
    deleteProject,
    deleteSession,
    duplicateProject,
    exportActivePlan,
    exportActivePlanSharePayload,
    flushGraphNodePositions,
    graph,
    importPlanJson,
    importPlanSharePayload,
    renameProject,
    renameSession,
    shareLocationAdapter,
    selectProject,
    selectSession,
    solver,
    workbench,
    workspace,
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

interface PlannerPageDatasetHarness {
  dataset: WritableSignal<{ id: string } | null>;
  loadError: WritableSignal<string | null>;
}

interface PlannerPageSolverHarness {
  solveError: WritableSignal<string | null>;
  solveResult: WritableSignal<PlannerPageSolveResult | null>;
  solveStatus: WritableSignal<'idle' | 'solving' | 'solved' | 'error'>;
}

interface PlannerPageWorkbenchHarness {
  activePanelId: WritableSignal<WorkbenchPanelId>;
  focusRequest: WritableSignal<null>;
  setActivePanel: (panelId: WorkbenchPanelId) => void;
}

interface PlannerPageWorkspaceHarness {
  activeProject: WritableSignal<PlannerProject | null>;
  activeProjectId: WritableSignal<string | undefined>;
  activeSession: WritableSignal<PlannerSession | null>;
  activeSessionId: WritableSignal<string | undefined>;
  activeSessionProjects: WritableSignal<PlannerProject[]>;
  createProject: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  dataset: WritableSignal<{ id: string } | null>;
  deleteProject: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  duplicateProject: ReturnType<typeof vi.fn>;
  renameProject: ReturnType<typeof vi.fn>;
  renameSession: ReturnType<typeof vi.fn>;
  selectProject: ReturnType<typeof vi.fn>;
  selectSession: ReturnType<typeof vi.fn>;
}

interface PlannerPageGraphHarness {
  readonly readModel: {
    readonly selectedNodeId: WritableSignal<string | null>;
  };
  readonly selectionCommands: {
    readonly clear: () => void;
  };
  readonly layoutCommands: {
    readonly cancelNodePositions: ReturnType<typeof vi.fn>;
    readonly flushNodePositions: () => void;
  };
}

interface PlannerPagePlanConfigHarness {
  readonly targetCommands: {
    readonly updateAmount: ReturnType<typeof vi.fn>;
  };
}

interface PlannerPageSolveResult {
  readonly status: ProductionPlanStatus;
  readonly warnings?: ReadonlyArray<{ readonly message: string }>;
}

interface PlannerPageClipboardAdapterHarness extends PlannerClipboardAdapter {
  writeText: ReturnType<typeof vi.fn>;
}

interface PlannerPageShareLocationAdapterHarness extends PlannerShareLocationAdapter {
  createShareUrl: ReturnType<typeof vi.fn>;
  readShareCode: ReturnType<typeof vi.fn>;
  clearShareCode: ReturnType<typeof vi.fn>;
}

function stubInputViewChild(
  component: PlannerPageComponent,
  property: 'projectNameInput' | 'sessionNameInput',
  focus: () => void,
  select?: () => void,
): void {
  const inputRef: ElementRef<HTMLInputElement> = {
    nativeElement: { focus, select } as unknown as HTMLInputElement,
  };
  Object.defineProperty(component, property, {
    configurable: true,
    value: () => inputRef,
  });
}

function stubElementViewChild(
  component: PlannerPageComponent,
  property: 'actionMenuSummary' | 'activePlanTrigger',
  focus: () => void,
): void {
  const elementRef: ElementRef<HTMLElement> = {
    nativeElement: { focus } as unknown as HTMLElement,
  };
  Object.defineProperty(component, property, {
    configurable: true,
    value: () => elementRef,
  });
}

function stubElementViewChildren(
  component: PlannerPageComponent,
  property: 'planSelectorOptions',
  focusCallbacks: readonly (() => void)[],
): void {
  const elementRefs: ElementRef<HTMLElement>[] = focusCallbacks.map((focus) => ({
    nativeElement: { focus } as unknown as HTMLElement,
  }));
  Object.defineProperty(component, property, {
    configurable: true,
    value: () => elementRefs,
  });
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

function createPageProjectList(count: number): PlannerProject[] {
  return Array.from({ length: count }, (_value, index) => {
    const planNumber = index + 1;
    return createPageProject(`project-${planNumber}`, `Factory ${planNumber}`, []);
  });
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

  public focus(): void {
    return undefined;
  }

  public closest(_selector: string): TestHTMLElement | null {
    return null;
  }
}

class TestDetailsElement extends TestHTMLElement {
  public open = false;

  public constructor() {
    super('details');
  }
}

class TestHTMLInputElement extends TestHTMLElement {
  public files: {
    item: (index: number) => { text: () => Promise<string> } | null;
  } | null = null;
  public value = '';
}
