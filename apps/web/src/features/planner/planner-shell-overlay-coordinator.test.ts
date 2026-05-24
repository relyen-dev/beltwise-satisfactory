import { describe, expect, it } from 'vitest';
import { PlannerShellOverlayCoordinator } from './planner-shell-overlay-coordinator';

describe('PlannerShellOverlayCoordinator', () => {
  it('opens the plan selector by clearing inline edits and closing the action menu', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.startProjectNameEdit('project-a', 'Draft factory');
    shell.actionMenuOpen.set(true);

    shell.openPlanSelector();

    expect(shell.planSelectorOpen()).toBe(true);
    expect(shell.actionMenuOpen()).toBe(false);
    expect(shell.isProjectNameEditing('project-a')).toBe(false);
  });

  it('opens the action menu by clearing inline edits and closing the plan selector', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.startSessionNameEdit('session-a', 'Default session');
    shell.planSelectorOpen.set(true);

    shell.syncActionMenuOpen(true);

    expect(shell.actionMenuOpen()).toBe(true);
    expect(shell.planSelectorOpen()).toBe(false);
    expect(shell.isSessionNameEditing('session-a')).toBe(false);
  });

  it('closes the action menu when toggling defaults or share import panels', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.syncActionMenuOpen(true);

    shell.toggleDefaultsPanel();

    expect(shell.defaultsPanelOpen()).toBe(true);
    expect(shell.actionMenuOpen()).toBe(false);

    shell.syncActionMenuOpen(true);

    shell.toggleShareImport();

    expect(shell.shareImportOpen()).toBe(true);
    expect(shell.actionMenuOpen()).toBe(false);
  });

  it('collapses and reopens the inspector independently from transient navigation state', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.openPlanSelector();
    shell.syncActionMenuOpen(true);

    shell.collapseInspectorPanel();

    expect(shell.inspectorPanelOpen()).toBe(false);

    shell.clearTransientNavigationState();

    expect(shell.inspectorPanelOpen()).toBe(false);

    shell.openInspectorPanel();

    expect(shell.inspectorPanelOpen()).toBe(true);
  });

  it('clears only transient navigation state for active-changing commands', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.startProjectNameEdit('project-a', 'Draft factory');
    shell.openPlanSelector();
    shell.syncActionMenuOpen(true);
    shell.defaultsPanelOpen.set(true);
    shell.shareImportOpen.set(true);

    shell.clearTransientNavigationState();

    expect(shell.isProjectNameEditing('project-a')).toBe(false);
    expect(shell.planSelectorOpen()).toBe(false);
    expect(shell.actionMenuOpen()).toBe(false);
    expect(shell.defaultsPanelOpen()).toBe(true);
    expect(shell.shareImportOpen()).toBe(true);
  });

  it('saves inline edits only while the edited entity is active', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.startProjectNameEdit('project-a', 'Draft factory');
    shell.projectNameDraft.set(' Renamed factory ');

    expect(shell.saveProjectNameEdit('project-a')).toBe('Renamed factory');
    expect(shell.isProjectNameEditing('project-a')).toBe(false);

    shell.startSessionNameEdit('session-a', 'Default session');
    shell.sessionNameDraft.set(' Rocky Desert ');

    expect(shell.saveSessionNameEdit('session-b')).toBeNull();
    expect(shell.isSessionNameEditing('session-a')).toBe(false);
  });

  it('handles Escape in shell priority order', () => {
    const shell = new PlannerShellOverlayCoordinator();
    const context = {
      activeProjectId: 'project-a',
      activeSessionId: 'session-a',
      hasSelectedGraphNode: true,
      isEditableTarget: false,
    };

    shell.startProjectNameEdit('project-a', 'Draft factory');
    expect(shell.handleEscape(context)).toEqual({ action: 'inline-edit' });

    shell.openPlanSelector();
    expect(shell.handleEscape(context)).toEqual({
      action: 'plan-selector',
      focusTarget: 'active-plan-trigger',
    });

    shell.syncActionMenuOpen(true);
    expect(shell.handleEscape(context)).toEqual({
      action: 'action-menu',
      focusTarget: 'action-menu-summary',
    });

    shell.defaultsPanelOpen.set(true);
    expect(shell.handleEscape(context)).toEqual({ action: 'defaults-panel' });

    expect(shell.handleEscape(context)).toEqual({ action: 'graph-selection' });
  });

  it('leaves defaults and graph selection alone on Escape from editable targets', () => {
    const shell = new PlannerShellOverlayCoordinator();
    shell.defaultsPanelOpen.set(true);

    expect(
      shell.handleEscape({
        activeProjectId: 'project-a',
        activeSessionId: 'session-a',
        hasSelectedGraphNode: true,
        isEditableTarget: true,
      }),
    ).toEqual({ action: 'none' });
    expect(shell.defaultsPanelOpen()).toBe(true);
  });
});
