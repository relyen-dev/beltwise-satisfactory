import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  Injector,
  computed,
  effect,
  inject,
  linkedSignal,
  type ElementRef,
  type OnInit,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgClass, NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { type ProductionPlanStatus } from '@beltwise/planner-core';
import { ProductionGraphComponent } from '../graph/production-graph.component';
import { PlannerDefaultsPanelComponent } from './workbench/planner-defaults-panel.component';
import { PlannerInspectorComponent } from './workbench/planner-inspector.component';
import {
  PlannerPlanTransferService,
  type PlanTransferStatus,
} from './transfer/planner-plan-transfer.service';
import { GameIconComponent } from './shared-ui/game-icon.component';
import {
  selectCompactPlanDockItems,
  selectPlanDockItems,
} from './state/planner-plan-dock.selectors';
import {
  projectRequiresDeleteConfirmation,
  sessionRequiresDeleteConfirmation,
} from './persistence/planner-session-delete.helpers';
import { PlannerStoreService } from './state/planner-store.service';
import { PlannerGraphStore } from './state/planner-graph.store';
import { PlannerPlanConfigStore } from './state/planner-plan-config.store';
import { PlannerWorkspaceSlice } from './state/planner-store.workspace';
import { DatasetService } from './dataset.service';
import { PlannerSolverService } from './solving/planner-solver.service';
import {
  getPlannerWorkbenchPanel,
  PLANNER_WORKBENCH_PANELS,
} from './workbench/planner-workbench-panel-registry';
import { type WorkbenchPanelId } from './workbench/planner-workbench.models';
import { PlannerWorkbenchSlice } from './workbench/planner-workbench-state';
import { PlannerShellOverlayCoordinator } from './planner-shell-overlay-coordinator';

interface GraphSolveNotice {
  kind: 'info' | 'error';
  message: string;
}

const VISIBLE_PLAN_CHIP_COUNT = 6;
const RECENT_PLAN_MEMORY_LIMIT = 12;

@Component({
  selector: 'bw-planner-page',
  standalone: true,
  imports: [
    FormsModule,
    NgClass,
    NgComponentOutlet,
    PlannerDefaultsPanelComponent,
    GameIconComponent,
    PlannerInspectorComponent,
    ProductionGraphComponent,
  ],
  templateUrl: './planner-page.component.html',
  styleUrl: './planner-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerPageComponent implements OnInit {
  private readonly runtime = inject(PlannerStoreService);
  public readonly datasetService = inject(DatasetService);
  public readonly graph = inject(PlannerGraphStore);
  public readonly planConfig = inject(PlannerPlanConfigStore);
  public readonly solver = inject(PlannerSolverService);
  public readonly workbench = inject(PlannerWorkbenchSlice);
  public readonly workspace = inject(PlannerWorkspaceSlice);
  private readonly injector = inject(Injector);
  private readonly planTransfer = inject(PlannerPlanTransferService);
  private readonly shell = new PlannerShellOverlayCoordinator();
  private lastProcessedShareCode: string | null = null;

  public readonly workPanelOpen = linkedSignal({
    source: () => this.workbench.focusRequest(),
    computation: (request, previous) => {
      return request ? request.mode === 'open-plan' : (previous?.value ?? false);
    },
  });
  public readonly defaultsPanelOpen = this.shell.defaultsPanelOpen;
  public readonly planSelectorOpen = this.shell.planSelectorOpen;
  public readonly actionMenuOpen = this.shell.actionMenuOpen;
  public readonly shareImportOpen = this.shell.shareImportOpen;
  public readonly shareCodeText = this.shell.shareCodeText;
  public readonly planTransferStatus = this.shell.planTransferStatus;
  public readonly projectNameInput = viewChild<ElementRef<HTMLInputElement>>('projectNameInput');
  public readonly sessionNameInput = viewChild<ElementRef<HTMLInputElement>>('sessionNameInput');
  public readonly activePlanTrigger = viewChild<ElementRef<HTMLElement>>('activePlanTrigger');
  private readonly inspectorPanel = viewChild<ElementRef<HTMLElement>>('inspectorPanel');
  public readonly planSelectorOptions = viewChildren<ElementRef<HTMLElement>>('planSelectorOption');
  public readonly actionMenuSummary = viewChild<ElementRef<HTMLElement>>('actionMenuSummary');
  private readonly recentlyTouchedProjectIds = signal<readonly string[]>([]);
  private inspectorScrollContext: string | null = null;
  public readonly projectNameDraft = this.shell.projectNameDraft;
  public readonly sessionNameDraft = this.shell.sessionNameDraft;
  public readonly projectNameEditing = computed(() => {
    return this.shell.isProjectNameEditing(this.workspace.activeProjectId());
  });
  public readonly sessionNameEditing = computed(() => {
    return this.shell.isSessionNameEditing(this.workspace.activeSessionId());
  });
  public readonly workbenchPanels = PLANNER_WORKBENCH_PANELS;
  public readonly activeWorkbenchPanel = computed(() => {
    return getPlannerWorkbenchPanel(this.workbench.activePanelId());
  });
  public readonly activeSectionLabel = computed(() => {
    return this.activeWorkbenchPanel().label;
  });
  public readonly graphSolveNotice = computed<GraphSolveNotice | null>(() => {
    const status = this.solver.solveStatus();
    if (status === 'solving') {
      return { kind: 'info', message: 'Solving plan' };
    }
    if (status === 'error') {
      return { kind: 'error', message: this.solver.solveError() ?? 'Solve error' };
    }

    const result = this.solver.solveResult();
    const problemMessage = result
      ? solveProblemMessage(result.status, result.warnings?.[0]?.message)
      : null;
    return problemMessage ? { kind: 'error', message: problemMessage } : null;
  });
  public readonly planDockItems = computed(() =>
    selectPlanDockItems(
      this.workspace.activeSessionProjects(),
      this.datasetService.dataset(),
      this.workspace.activeProjectId(),
    ),
  );
  public readonly activePlanDockItem = computed(() => {
    return this.planDockItems().find((item) => item.isActive) ?? null;
  });
  public readonly visiblePlanDockItems = computed(() =>
    selectCompactPlanDockItems(
      this.planDockItems(),
      this.workspace.activeProjectId(),
      this.recentlyTouchedProjectIds(),
      VISIBLE_PLAN_CHIP_COUNT,
    ),
  );

  public ngOnInit(): void {
    void this.runtime;

    effect(
      () => {
        if (!this.datasetService.dataset()) {
          return;
        }

        this.importPlanShareCodeFromLocation();
      },
      { injector: this.injector },
    );

    effect(
      () => {
        const panel = this.inspectorPanel()?.nativeElement;
        const context = `${this.workspace.activeProjectId() ?? 'no-project'}:${
          this.graph.readModel.selectedNodeId() ?? 'overview'
        }`;
        if (!panel || context === this.inspectorScrollContext) {
          return;
        }

        this.inspectorScrollContext = context;
        scrollElementToTopAfterRender(() => this.inspectorPanel()?.nativeElement);
      },
      { injector: this.injector },
    );
  }

  public openSection(section: WorkbenchPanelId): void {
    if (this.workbench.activePanelId() === section && this.workPanelOpen()) {
      this.closeWorkPanel();
      return;
    }

    this.workbench.setActivePanel(section);
    this.workPanelOpen.set(true);
  }

  public closeWorkPanel(): void {
    this.workPanelOpen.set(false);
  }

  public selectSession(sessionId: string): void {
    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.workspace.selectSession(sessionId);
    this.touchActiveProject();
  }

  public selectProject(projectId: string): void {
    if (projectId === this.workspace.activeProjectId()) {
      this.clearTransientNavigationState();
      this.touchProject(projectId);
      return;
    }

    this.clearTransientNavigationState();
    this.workspace.selectProject(projectId);
    this.touchProject(projectId);
  }

  public createSession(): void {
    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.workspace.createSession();
    this.touchActiveProject();
  }

  public createProject(): void {
    this.clearTransientNavigationState();
    this.workspace.createProject();
    this.touchActiveProject();
  }

  public duplicateProject(): void {
    this.clearTransientNavigationState();
    this.workspace.duplicateProject();
    this.touchActiveProject();
  }

  public startSessionNameEdit(sessionId: string, name: string): void {
    this.shell.startSessionNameEdit(sessionId, name);
    this.focusSessionNameInput();
  }

  public saveSessionNameEdit(): void {
    const name = this.shell.saveSessionNameEdit(this.workspace.activeSessionId());
    if (name) {
      this.workspace.renameSession(name);
    }
  }

  public cancelSessionNameEdit(): void {
    this.shell.cancelSessionNameEdit();
  }

  public deleteActiveSession(): void {
    const session = this.workspace.activeSession();
    if (!session) {
      return;
    }

    if (
      sessionRequiresDeleteConfirmation(this.workspace.activeSessionProjects()) &&
      !confirm(`Delete "${session.name}" and every plan in it? This cannot be undone.`)
    ) {
      return;
    }

    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.workspace.deleteSession(session.id);
    this.touchActiveProject();
  }

  public deleteActiveProject(): void {
    const project = this.workspace.activeProject();
    if (!project) {
      return;
    }

    if (
      projectRequiresDeleteConfirmation(project) &&
      !confirm(`Delete "${project.name}"? This cannot be undone.`)
    ) {
      return;
    }

    this.clearTransientNavigationState();
    this.workspace.deleteProject();
    this.touchActiveProject();
  }

  public startProjectNameEdit(projectId: string, name: string): void {
    this.shell.startProjectNameEdit(projectId, name);
    this.focusProjectNameInput();
  }

  public saveProjectNameEdit(): void {
    const name = this.shell.saveProjectNameEdit(this.workspace.activeProjectId());
    if (name) {
      this.workspace.renameProject(name);
    }
  }

  public cancelProjectNameEdit(): void {
    this.shell.cancelProjectNameEdit();
  }

  public toggleDefaultsPanel(): void {
    this.shell.toggleDefaultsPanel();
  }

  public closeDefaultsPanel(): void {
    this.shell.closeDefaultsPanel();
  }

  public toggleShareImport(): void {
    this.shell.toggleShareImport();
  }

  public closeShareImport(): void {
    this.shell.closeShareImport();
  }

  public togglePlanSelector(): void {
    if (this.shell.togglePlanSelector() === 'opened') {
      this.focusActivePlanSelectorOption();
    }
  }

  public openPlanSelector(): void {
    this.shell.openPlanSelector();
    this.focusActivePlanSelectorOption();
  }

  public closePlanSelector(restoreFocus = false): void {
    const wasOpen = this.shell.closePlanSelector();
    if (restoreFocus && wasOpen) {
      this.focusPlanSelectorTrigger();
    }
  }

  public selectProjectFromSelector(projectId: string): void {
    this.selectProject(projectId);
    this.focusPlanSelectorTrigger();
  }

  public syncActionMenuOpen(event: Event): void {
    if (!isDetailsElement(event.currentTarget)) {
      return;
    }

    this.shell.syncActionMenuOpen(event.currentTarget.open);
  }

  public closeActionMenu(restoreFocus = false): void {
    const wasOpen = this.shell.closeActionMenu();
    if (restoreFocus && wasOpen) {
      focusElementAfterRender(() => this.actionMenuSummary()?.nativeElement);
    }
  }

  public exportActivePlan(): void {
    this.closeActionMenu();
    this.showPlanTransferStatus(this.planTransfer.exportActivePlan());
  }

  public async copyActivePlanShareLink(): Promise<void> {
    this.closeActionMenu();
    this.showPlanTransferStatus(await this.planTransfer.copyActivePlanShareLink());
  }

  public async importPlanShareCodeInput(): Promise<void> {
    const code = this.shareCodeText().trim();
    if (!code) {
      this.showPlanTransferStatus({
        kind: 'error',
        message: 'Paste a Beltwise plan link or code first.',
      });
      return;
    }

    const imported = await this.importPlanShareCode(code, 'Shared plan');
    if (imported) {
      this.shareCodeText.set('');
      this.shell.closeShareImport();
    }
  }

  public async importPlanFile(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.item(0) ?? null;
    if (!file) {
      return;
    }

    try {
      this.clearTransientNavigationState();
      const result = await this.planTransfer.importPlanFile(file);
      if (result.imported) {
        this.touchActiveProject();
      }
      this.showPlanTransferStatus(result.status);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  @HostListener('window:beforeunload')
  @HostListener('window:pagehide')
  public flushGraphNodePositionsBeforeUnload(): void {
    this.graph.layoutCommands.flushNodePositions();
  }

  @HostListener('window:hashchange')
  public importPlanShareCodeFromLocation(): void {
    if (!this.datasetService.dataset()) {
      return;
    }

    const code = this.planTransfer.readShareCodeFromLocation();
    if (!code || code === this.lastProcessedShareCode) {
      return;
    }

    this.lastProcessedShareCode = code;
    void this.importPlanShareCode(code, 'Shared plan link');
  }

  @HostListener('document:keydown.escape', ['$event'])
  public handleEscapeKey(event: KeyboardEvent): void {
    const result = this.shell.handleEscape({
      activeProjectId: this.workspace.activeProjectId(),
      activeSessionId: this.workspace.activeSessionId(),
      hasSelectedGraphNode: Boolean(this.graph.readModel.selectedNodeId()),
      isEditableTarget: isEditableKeyboardTarget(event.target),
    });
    if (result.action === 'none') {
      return;
    }

    event.preventDefault();
    if (result.focusTarget === 'active-plan-trigger') {
      this.focusPlanSelectorTrigger();
      return;
    }
    if (result.focusTarget === 'action-menu-summary') {
      focusElementAfterRender(() => this.actionMenuSummary()?.nativeElement);
      return;
    }
    if (result.action === 'graph-selection') {
      this.graph.selectionCommands.clear();
      blurFocusedGraphNode();
    }
  }

  private clearTransientNavigationState(): void {
    this.shell.clearTransientNavigationState();
  }

  private showPlanTransferStatus(status: PlanTransferStatus): void {
    this.shell.showPlanTransferStatus(status);
  }

  private touchActiveProject(): void {
    this.touchProject(this.workspace.activeProjectId());
  }

  private touchProject(projectId: string | undefined): void {
    if (
      !projectId ||
      !this.workspace.activeSessionProjects().some((project) => project.id === projectId)
    ) {
      return;
    }

    this.recentlyTouchedProjectIds.update((projectIds) =>
      [projectId, ...projectIds.filter((candidateId) => candidateId !== projectId)].slice(
        0,
        RECENT_PLAN_MEMORY_LIMIT,
      ),
    );
  }

  private focusProjectNameInput(): void {
    focusElementAfterRender(() => this.projectNameInput()?.nativeElement);
  }

  private focusSessionNameInput(): void {
    focusElementAfterRender(() => this.sessionNameInput()?.nativeElement);
  }

  private focusPlanSelectorTrigger(): void {
    if (!this.activePlanTrigger()) {
      return;
    }
    focusElementAfterRender(() => this.activePlanTrigger()?.nativeElement);
  }

  private focusActivePlanSelectorOption(): void {
    focusElementAfterRender(() => {
      const options = this.planSelectorOptions();
      if (options.length === 0) {
        return undefined;
      }
      const activeIndex = this.planDockItems().findIndex((item) => item.isActive);
      return options[Math.max(activeIndex, 0)]?.nativeElement ?? options[0]?.nativeElement;
    });
  }

  private async importPlanShareCode(value: string, sourceLabel: string): Promise<boolean> {
    const result = await this.planTransfer.importPlanShareCode(value, sourceLabel, () =>
      this.clearTransientNavigationState(),
    );
    if (result.imported) {
      this.touchActiveProject();
    }
    this.showPlanTransferStatus(result.status);
    return result.imported;
  }
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

function isDetailsElement(target: EventTarget | null): target is HTMLDetailsElement {
  return (
    target instanceof HTMLElement && target.tagName.toLowerCase() === 'details' && 'open' in target
  );
}

function blurFocusedGraphNode(): void {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return;
  }
  if (activeElement.closest('.production-node')) {
    activeElement.blur();
  }
}

function solveProblemMessage(status: ProductionPlanStatus, detail?: string): string | null {
  const message = detail?.trim();
  switch (status) {
    case 'optimal':
      return null;
    case 'infeasible':
      return message || 'Infeasible plan';
    case 'unbounded':
      return message || 'Unbounded plan';
    case 'error':
      return message || 'Solve error';
  }
}

function focusElementAfterRender(element: () => HTMLElement | undefined, attempts = 4): void {
  setTimeout(() => {
    const target = element();
    if (target) {
      target.focus();
      return;
    }
    if (attempts > 0) {
      focusElementAfterRender(element, attempts - 1);
    }
  });
}

function scrollElementToTopAfterRender(element: () => HTMLElement | undefined, attempts = 4): void {
  setTimeout(() => {
    const target = element();
    if (target) {
      target.scrollTop = 0;
      target.scrollLeft = 0;
      return;
    }
    if (attempts > 0) {
      scrollElementToTopAfterRender(element, attempts - 1);
    }
  });
}
