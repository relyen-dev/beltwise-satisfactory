import { signal, type WritableSignal } from '@angular/core';
import { type PlanTransferStatus } from './transfer/planner-plan-transfer.service';

export type PlannerShellEscapeAction =
  | 'none'
  | 'inline-edit'
  | 'plan-selector'
  | 'action-menu'
  | 'defaults-panel'
  | 'graph-selection';

export type PlannerShellFocusTarget = 'active-plan-trigger' | 'action-menu-summary';

export interface PlannerShellEscapeContext {
  readonly activeProjectId: string | undefined;
  readonly activeSessionId: string | undefined;
  readonly hasSelectedGraphNode: boolean;
  readonly isEditableTarget: boolean;
}

export interface PlannerShellEscapeResult {
  readonly action: PlannerShellEscapeAction;
  readonly focusTarget?: PlannerShellFocusTarget;
}

export type PlannerShellPlanSelectorToggleResult = 'opened' | 'closed';

export class PlannerShellOverlayCoordinator {
  public readonly defaultsPanelOpen = signal(false);
  public readonly planSelectorOpen = signal(false);
  public readonly actionMenuOpen = signal(false);
  public readonly shareImportOpen = signal(false);
  public readonly shareCodeText = signal('');
  public readonly planTransferStatus: WritableSignal<PlanTransferStatus | null> = signal(null);
  public readonly projectNameDraft = signal('');
  public readonly sessionNameDraft = signal('');

  private readonly projectNameEditProjectId = signal<string | null>(null);
  private readonly sessionNameEditSessionId = signal<string | null>(null);

  public isProjectNameEditing(activeProjectId: string | undefined): boolean {
    return this.projectNameEditProjectId() === activeProjectId;
  }

  public isSessionNameEditing(activeSessionId: string | undefined): boolean {
    return this.sessionNameEditSessionId() === activeSessionId;
  }

  public startProjectNameEdit(projectId: string, name: string): void {
    this.closePlanSelector();
    this.closeActionMenu();
    this.projectNameEditProjectId.set(projectId);
    this.projectNameDraft.set(name);
  }

  public saveProjectNameEdit(activeProjectId: string | undefined): string | null {
    const name = this.projectNameDraft().trim();
    const editedProjectId = this.projectNameEditProjectId();
    this.projectNameEditProjectId.set(null);
    return name.length > 0 && editedProjectId === activeProjectId ? name : null;
  }

  public cancelProjectNameEdit(): void {
    this.projectNameEditProjectId.set(null);
  }

  public startSessionNameEdit(sessionId: string, name: string): void {
    this.closePlanSelector();
    this.closeActionMenu();
    this.sessionNameEditSessionId.set(sessionId);
    this.sessionNameDraft.set(name);
  }

  public saveSessionNameEdit(activeSessionId: string | undefined): string | null {
    const name = this.sessionNameDraft().trim();
    const editedSessionId = this.sessionNameEditSessionId();
    this.sessionNameEditSessionId.set(null);
    return name.length > 0 && editedSessionId === activeSessionId ? name : null;
  }

  public cancelSessionNameEdit(): void {
    this.sessionNameEditSessionId.set(null);
  }

  public clearInlineEdits(): void {
    this.projectNameEditProjectId.set(null);
    this.sessionNameEditSessionId.set(null);
  }

  public toggleDefaultsPanel(): void {
    this.closeActionMenu();
    this.defaultsPanelOpen.update((open) => !open);
  }

  public closeDefaultsPanel(): void {
    this.defaultsPanelOpen.set(false);
  }

  public toggleShareImport(): void {
    this.closeActionMenu();
    this.shareImportOpen.update((open) => !open);
  }

  public closeShareImport(): void {
    this.shareImportOpen.set(false);
  }

  public togglePlanSelector(): PlannerShellPlanSelectorToggleResult {
    if (this.planSelectorOpen()) {
      this.closePlanSelector();
      return 'closed';
    }

    this.openPlanSelector();
    return 'opened';
  }

  public openPlanSelector(): void {
    this.clearInlineEdits();
    this.closeActionMenu();
    this.planSelectorOpen.set(true);
  }

  public closePlanSelector(): boolean {
    const wasOpen = this.planSelectorOpen();
    this.planSelectorOpen.set(false);
    return wasOpen;
  }

  public syncActionMenuOpen(open: boolean): void {
    this.actionMenuOpen.set(open);
    if (open) {
      this.clearInlineEdits();
      this.closePlanSelector();
    }
  }

  public closeActionMenu(): boolean {
    const wasOpen = this.actionMenuOpen();
    this.actionMenuOpen.set(false);
    return wasOpen;
  }

  public clearTransientNavigationState(): void {
    this.clearInlineEdits();
    this.closePlanSelector();
    this.closeActionMenu();
  }

  public showPlanTransferStatus(status: PlanTransferStatus): void {
    this.planTransferStatus.set(status);
  }

  public handleEscape(context: PlannerShellEscapeContext): PlannerShellEscapeResult {
    if (
      this.isProjectNameEditing(context.activeProjectId) ||
      this.isSessionNameEditing(context.activeSessionId)
    ) {
      this.clearInlineEdits();
      return { action: 'inline-edit' };
    }

    if (this.planSelectorOpen()) {
      this.closePlanSelector();
      return { action: 'plan-selector', focusTarget: 'active-plan-trigger' };
    }

    if (this.actionMenuOpen()) {
      this.closeActionMenu();
      return { action: 'action-menu', focusTarget: 'action-menu-summary' };
    }

    if (this.defaultsPanelOpen() && !context.isEditableTarget) {
      this.closeDefaultsPanel();
      return { action: 'defaults-panel' };
    }

    if (!context.hasSelectedGraphNode || context.isEditableTarget) {
      return { action: 'none' };
    }

    return { action: 'graph-selection' };
  }
}
