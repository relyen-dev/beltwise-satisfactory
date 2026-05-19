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
import { FormsModule } from '@angular/forms';
import { type ProductionPlanStatus } from '@beltwise/planner-core';
import { ProductionGraphComponent } from '../graph/production-graph.component';
import { PlannerDefaultsPanelComponent } from './workbench/planner-defaults-panel.component';
import { PlannerDisplaySectionComponent } from './workbench/planner-display-section.component';
import { PlannerInputsSectionComponent } from './workbench/planner-inputs-section.component';
import { PlannerInspectorComponent } from './workbench/planner-inspector.component';
import { PlannerMachinesSectionComponent } from './workbench/planner-machines-section.component';
import { PlannerObjectivesSectionComponent } from './workbench/planner-objectives-section.component';
import {
  PlannerPlanTransferService,
  type PlanTransferStatus,
} from './transfer/planner-plan-transfer.service';
import { PlannerRecipesSectionComponent } from './workbench/planner-recipes-section.component';
import { PlannerResourcesSectionComponent } from './workbench/planner-resources-section.component';
import { GameIconComponent } from './shared-ui/game-icon.component';
import {
  selectCompactPlanDockItems,
  selectPlanDockItems,
} from './state/planner-plan-dock.selectors';
import {
  projectRequiresDeleteConfirmation,
  sessionRequiresDeleteConfirmation,
} from './persistence/planner-session-delete.helpers';
import { PlannerStoreService, type ConfigurationTab } from './state/planner-store.service';
import { PlannerTargetsSectionComponent } from './workbench/planner-targets-section.component';

interface ConfigurationTabDefinition {
  id: ConfigurationTab;
  label: string;
}

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
    PlannerDefaultsPanelComponent,
    PlannerDisplaySectionComponent,
    GameIconComponent,
    PlannerInputsSectionComponent,
    PlannerInspectorComponent,
    PlannerMachinesSectionComponent,
    PlannerObjectivesSectionComponent,
    PlannerRecipesSectionComponent,
    PlannerResourcesSectionComponent,
    PlannerTargetsSectionComponent,
    ProductionGraphComponent,
  ],
  templateUrl: './planner-page.component.html',
  styleUrl: './planner-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerPageComponent implements OnInit {
  public readonly store = inject(PlannerStoreService);
  private readonly injector = inject(Injector);
  private readonly planTransfer = inject(PlannerPlanTransferService);
  private lastProcessedShareCode: string | null = null;

  public readonly workPanelOpen = linkedSignal({
    source: () => this.store.workbenchFocusRequest(),
    computation: (request, previous) => {
      return request ? request.mode === 'open-plan' : (previous?.value ?? false);
    },
  });
  public readonly defaultsPanelOpen = signal(false);
  public readonly planSelectorOpen = signal(false);
  public readonly actionMenuOpen = signal(false);
  public readonly shareImportOpen = signal(false);
  public readonly shareCodeText = signal('');
  public readonly planTransferStatus = signal<PlanTransferStatus | null>(null);
  public readonly projectNameInput = viewChild<ElementRef<HTMLInputElement>>('projectNameInput');
  public readonly sessionNameInput = viewChild<ElementRef<HTMLInputElement>>('sessionNameInput');
  public readonly activePlanTrigger = viewChild<ElementRef<HTMLElement>>('activePlanTrigger');
  private readonly inspectorPanel = viewChild<ElementRef<HTMLElement>>('inspectorPanel');
  public readonly planSelectorOptions = viewChildren<ElementRef<HTMLElement>>('planSelectorOption');
  public readonly actionMenuSummary = viewChild<ElementRef<HTMLElement>>('actionMenuSummary');
  private readonly recentlyTouchedProjectIds = signal<readonly string[]>([]);
  private readonly projectNameEditProjectId = signal<string | null>(null);
  private readonly sessionNameEditSessionId = signal<string | null>(null);
  private inspectorScrollContext: string | null = null;
  public readonly projectNameDraft = signal('');
  public readonly sessionNameDraft = signal('');
  public readonly projectNameEditing = computed(() => {
    return this.projectNameEditProjectId() === this.store.activeProjectId();
  });
  public readonly sessionNameEditing = computed(() => {
    return this.sessionNameEditSessionId() === this.store.activeSessionId();
  });
  public readonly tabs: ConfigurationTabDefinition[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'objectives', label: 'Objectives' },
    { id: 'recipes', label: 'Recipes' },
    { id: 'inputs', label: 'Inputs' },
    { id: 'resources', label: 'Resources' },
    { id: 'machines', label: 'Machines' },
    { id: 'display', label: 'Display' },
  ];
  public readonly activeSectionLabel = computed(() => {
    return this.tabs.find((tab) => tab.id === this.store.activeConfigTab())?.label ?? 'Plan';
  });
  public readonly graphSolveNotice = computed<GraphSolveNotice | null>(() => {
    const status = this.store.solveStatus();
    if (status === 'solving') {
      return { kind: 'info', message: 'Solving plan' };
    }
    if (status === 'error') {
      return { kind: 'error', message: this.store.solveError() ?? 'Solve error' };
    }

    const result = this.store.solveResult();
    const problemMessage = result
      ? solveProblemMessage(result.status, result.warnings?.[0]?.message)
      : null;
    return problemMessage ? { kind: 'error', message: problemMessage } : null;
  });
  public readonly planDockItems = computed(() =>
    selectPlanDockItems(
      this.store.activeSessionProjects(),
      this.store.dataset(),
      this.store.activeProjectId(),
    ),
  );
  public readonly activePlanDockItem = computed(() => {
    return this.planDockItems().find((item) => item.isActive) ?? null;
  });
  public readonly visiblePlanDockItems = computed(() =>
    selectCompactPlanDockItems(
      this.planDockItems(),
      this.store.activeProjectId(),
      this.recentlyTouchedProjectIds(),
      VISIBLE_PLAN_CHIP_COUNT,
    ),
  );

  public ngOnInit(): void {
    effect(
      () => {
        if (!this.store.dataset()) {
          return;
        }

        this.importPlanShareCodeFromLocation();
      },
      { injector: this.injector },
    );

    effect(
      () => {
        const panel = this.inspectorPanel()?.nativeElement;
        const context = `${this.store.activeProjectId() ?? 'no-project'}:${
          this.store.selectedGraphNodeId() ?? 'overview'
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

  public openSection(section: ConfigurationTab): void {
    if (this.store.activeConfigTab() === section && this.workPanelOpen()) {
      this.closeWorkPanel();
      return;
    }

    this.store.activeConfigTab.set(section);
    this.workPanelOpen.set(true);
  }

  public closeWorkPanel(): void {
    this.workPanelOpen.set(false);
  }

  public selectSession(sessionId: string): void {
    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.store.selectSession(sessionId);
    this.touchActiveProject();
  }

  public selectProject(projectId: string): void {
    if (projectId === this.store.activeProjectId()) {
      this.clearTransientNavigationState();
      this.touchProject(projectId);
      return;
    }

    this.clearTransientNavigationState();
    this.store.selectProject(projectId);
    this.touchProject(projectId);
  }

  public createSession(): void {
    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.store.createSession();
    this.touchActiveProject();
  }

  public createProject(): void {
    this.clearTransientNavigationState();
    this.store.createProject();
    this.touchActiveProject();
  }

  public duplicateProject(): void {
    this.clearTransientNavigationState();
    this.store.duplicateProject();
    this.touchActiveProject();
  }

  public startSessionNameEdit(sessionId: string, name: string): void {
    this.closePlanSelector();
    this.closeActionMenu();
    this.sessionNameEditSessionId.set(sessionId);
    this.sessionNameDraft.set(name);
    this.focusSessionNameInput();
  }

  public saveSessionNameEdit(): void {
    const name = this.sessionNameDraft().trim();
    const editedSessionId = this.sessionNameEditSessionId();
    if (name.length > 0 && editedSessionId === this.store.activeSessionId()) {
      this.store.renameSession(name);
    }
    this.sessionNameEditSessionId.set(null);
  }

  public cancelSessionNameEdit(): void {
    this.sessionNameEditSessionId.set(null);
  }

  public deleteActiveSession(): void {
    const session = this.store.activeSession();
    if (!session) {
      return;
    }

    if (
      sessionRequiresDeleteConfirmation(this.store.activeSessionProjects()) &&
      !confirm(`Delete "${session.name}" and every plan in it? This cannot be undone.`)
    ) {
      return;
    }

    this.clearTransientNavigationState();
    this.recentlyTouchedProjectIds.set([]);
    this.store.deleteSession(session.id);
    this.touchActiveProject();
  }

  public deleteActiveProject(): void {
    const project = this.store.activeProject();
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
    this.store.deleteProject();
    this.touchActiveProject();
  }

  public startProjectNameEdit(projectId: string, name: string): void {
    this.closePlanSelector();
    this.closeActionMenu();
    this.projectNameEditProjectId.set(projectId);
    this.projectNameDraft.set(name);
    this.focusProjectNameInput();
  }

  public saveProjectNameEdit(): void {
    const name = this.projectNameDraft().trim();
    const editedProjectId = this.projectNameEditProjectId();
    if (name.length > 0 && editedProjectId === this.store.activeProjectId()) {
      this.store.renameProject(name);
    }
    this.projectNameEditProjectId.set(null);
  }

  public cancelProjectNameEdit(): void {
    this.projectNameEditProjectId.set(null);
  }

  public toggleDefaultsPanel(): void {
    this.closeActionMenu();
    this.defaultsPanelOpen.update((open) => !open);
  }

  public toggleShareImport(): void {
    this.closeActionMenu();
    this.shareImportOpen.update((open) => !open);
  }

  public togglePlanSelector(): void {
    if (this.planSelectorOpen()) {
      this.closePlanSelector();
      return;
    }

    this.openPlanSelector();
  }

  public openPlanSelector(): void {
    this.clearInlineEdits();
    this.closeActionMenu();
    this.planSelectorOpen.set(true);
    this.focusActivePlanSelectorOption();
  }

  public closePlanSelector(restoreFocus = false): void {
    const wasOpen = this.planSelectorOpen();
    this.planSelectorOpen.set(false);
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

    this.actionMenuOpen.set(event.currentTarget.open);
    if (event.currentTarget.open) {
      this.clearInlineEdits();
      this.closePlanSelector();
    }
  }

  public closeActionMenu(restoreFocus = false): void {
    if (!this.actionMenuOpen()) {
      return;
    }

    this.actionMenuOpen.set(false);
    if (restoreFocus) {
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
      this.shareImportOpen.set(false);
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
    this.store.flushGraphNodePositions();
  }

  @HostListener('window:hashchange')
  public importPlanShareCodeFromLocation(): void {
    if (!this.store.dataset()) {
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
    if (this.projectNameEditing() || this.sessionNameEditing()) {
      event.preventDefault();
      this.clearInlineEdits();
      return;
    }
    if (this.planSelectorOpen()) {
      event.preventDefault();
      this.closePlanSelector(true);
      return;
    }
    if (this.actionMenuOpen()) {
      event.preventDefault();
      this.closeActionMenu(true);
      return;
    }
    if (this.defaultsPanelOpen() && !isEditableKeyboardTarget(event.target)) {
      event.preventDefault();
      this.defaultsPanelOpen.set(false);
      return;
    }
    if (!this.store.selectedGraphNodeId() || isEditableKeyboardTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.store.clearSelectedGraphNode();
    blurFocusedGraphNode();
  }

  private showPlanTransferStatus(status: PlanTransferStatus): void {
    this.planTransferStatus.set(status);
  }

  private clearInlineEdits(): void {
    this.projectNameEditProjectId.set(null);
    this.sessionNameEditSessionId.set(null);
  }

  private clearTransientNavigationState(): void {
    this.clearInlineEdits();
    this.closePlanSelector();
    this.closeActionMenu();
  }

  private touchActiveProject(): void {
    this.touchProject(this.store.activeProjectId());
  }

  private touchProject(projectId: string | undefined): void {
    if (
      !projectId ||
      !this.store.activeSessionProjects().some((project) => project.id === projectId)
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
