import { CommonModule } from '@angular/common';
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
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductionGraphComponent } from '../graph/production-graph.component';
import { PlannerDefaultsPanelComponent } from './planner-defaults-panel.component';
import { PlannerDisplaySectionComponent } from './planner-display-section.component';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerInspectorComponent } from './planner-inspector.component';
import { PlannerMachinesSectionComponent } from './planner-machines-section.component';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerResourcesSectionComponent } from './planner-resources-section.component';
import {
  clearPlannerShareCodeFromLocation,
  createPlannerShareUrl,
  decodePlannerShareCode,
  encodePlannerShareCode,
  readPlannerShareCodeFromLocation,
} from './planner-share-codec';
import { GameIconComponent } from './game-icon.component';
import { selectCompactPlanDockItems, selectPlanDockItems } from './planner-plan-dock.selectors';
import {
  projectRequiresDeleteConfirmation,
  sessionRequiresDeleteConfirmation,
} from './planner-session-delete.helpers';
import { PlannerStoreService, type ConfigurationTab } from './planner-store.service';
import { PlannerTargetsSectionComponent } from './planner-targets-section.component';

interface ConfigurationTabDefinition {
  id: ConfigurationTab;
  label: string;
}

interface PlanTransferStatus {
  kind: 'success' | 'warning' | 'error';
  message: string;
}

const VISIBLE_PLAN_CHIP_COUNT = 6;
const RECENT_PLAN_MEMORY_LIMIT = 12;

@Component({
  selector: 'bw-planner-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PlannerDefaultsPanelComponent,
    PlannerDisplaySectionComponent,
    GameIconComponent,
    PlannerInputsSectionComponent,
    PlannerInspectorComponent,
    PlannerMachinesSectionComponent,
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
  public readonly actionMenuSummary = viewChild<ElementRef<HTMLElement>>('actionMenuSummary');
  private readonly recentlyTouchedProjectIds = signal<readonly string[]>([]);
  private readonly projectNameEditProjectId = signal<string | null>(null);
  private readonly sessionNameEditSessionId = signal<string | null>(null);
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
    { id: 'recipes', label: 'Recipes' },
    { id: 'inputs', label: 'Inputs' },
    { id: 'resources', label: 'Resources' },
    { id: 'machines', label: 'Machines' },
    { id: 'display', label: 'Display' },
  ];
  public readonly activeSectionLabel = computed(() => {
    return this.tabs.find((tab) => tab.id === this.store.activeConfigTab())?.label ?? 'Plan';
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
  }

  public closePlanSelector(): void {
    this.planSelectorOpen.set(false);
  }

  public selectProjectFromSelector(projectId: string): void {
    this.selectProject(projectId);
  }

  public syncActionMenuOpen(event: Event): void {
    if (isDetailsElement(event.currentTarget)) {
      this.actionMenuOpen.set(event.currentTarget.open);
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
    const result = this.store.exportActivePlan();
    if (!result.ok) {
      this.showPlanTransferStatus('error', result.message);
      return;
    }

    try {
      downloadJsonFile(result.filename, result.json);
      this.showPlanTransferStatus('success', `Exported ${result.filename}.`);
    } catch {
      this.showPlanTransferStatus('error', 'The plan export could not be downloaded.');
    }
  }

  public async copyActivePlanShareLink(): Promise<void> {
    this.closeActionMenu();
    const result = this.store.exportActivePlanSharePayload();
    if (!result.ok) {
      this.showPlanTransferStatus('error', result.message);
      return;
    }

    try {
      const code = await withTimeout(
        encodePlannerShareCode(result.payload),
        'The plan link could not be compressed.',
      );
      const url = createPlannerShareUrl(code);
      await copyTextToClipboard(url);
      this.showPlanTransferStatus('success', 'Copied a self-contained plan link.');
    } catch (error) {
      this.showPlanTransferStatus('error', shareErrorMessage(error));
    }
  }

  public async importPlanShareCodeInput(): Promise<void> {
    const code = this.shareCodeText().trim();
    if (!code) {
      this.showPlanTransferStatus('error', 'Paste a Beltwise plan link or code first.');
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
      const result = this.store.importPlanJson(await file.text());
      if (!result.ok) {
        this.showPlanTransferStatus('error', result.message);
        return;
      }

      this.touchActiveProject();
      this.showPlanImportResult(result.project.name, result.warnings);
    } catch {
      this.showPlanTransferStatus('error', 'The selected plan file could not be read.');
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

    const code = readPlannerShareCodeFromLocation();
    if (!code || code === this.lastProcessedShareCode) {
      return;
    }

    this.lastProcessedShareCode = code;
    void this.importPlanShareCode(code, 'Shared plan link');
  }

  @HostListener('document:keydown.escape', ['$event'])
  public clearGraphSelectionFromKeyboard(event: KeyboardEvent): void {
    if (this.projectNameEditing() || this.sessionNameEditing()) {
      event.preventDefault();
      this.clearInlineEdits();
      return;
    }
    if (this.planSelectorOpen()) {
      event.preventDefault();
      this.closePlanSelector();
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

  private showPlanTransferStatus(kind: PlanTransferStatus['kind'], message: string): void {
    this.planTransferStatus.set({ kind, message });
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

  private showPlanImportResult(
    projectName: string,
    warnings: ReadonlyArray<{ message: string }>,
  ): void {
    const datasetWarning = warnings[0];
    this.showPlanTransferStatus(
      datasetWarning ? 'warning' : 'success',
      datasetWarning
        ? `Imported ${projectName}. ${datasetWarning.message}`
        : `Imported ${projectName}.`,
    );
  }

  private async importPlanShareCode(value: string, sourceLabel: string): Promise<boolean> {
    try {
      const payload = await decodePlannerShareCode(value);
      this.clearTransientNavigationState();
      const result = this.store.importPlanSharePayload(payload);
      if (!result.ok) {
        this.showPlanTransferStatus('error', result.message);
        return false;
      }

      clearPlannerShareCodeFromLocation();
      this.touchActiveProject();
      this.showPlanImportResult(result.project.name, result.warnings);
      return true;
    } catch (error) {
      this.showPlanTransferStatus(
        'error',
        `${sourceLabel} could not be imported. ${shareErrorMessage(error)}`,
      );
      return false;
    }
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
    target instanceof HTMLElement &&
    target.tagName.toLowerCase() === 'details' &&
    'open' in target
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

function downloadJsonFile(filename: string, json: string): void {
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
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await withTimeout(navigator.clipboard.writeText(value), 'Clipboard copy timed out.');
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
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), 2000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function shareErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The plan link could not be processed.';
}
