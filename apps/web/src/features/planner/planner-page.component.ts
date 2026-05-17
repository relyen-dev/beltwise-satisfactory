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
  type OnInit,
  signal,
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

@Component({
  selector: 'bw-planner-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PlannerDefaultsPanelComponent,
    PlannerDisplaySectionComponent,
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
  public readonly inspectorOpen = signal(true);
  public readonly defaultsPanelOpen = signal(false);
  public readonly shareImportOpen = signal(false);
  public readonly shareCodeText = signal('');
  public readonly planTransferStatus = signal<PlanTransferStatus | null>(null);
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

  public toggleDefaultsPanel(): void {
    this.defaultsPanelOpen.update((open) => !open);
  }

  public toggleShareImport(): void {
    this.shareImportOpen.update((open) => !open);
  }

  public exportActivePlan(): void {
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
      const result = this.store.importPlanJson(await file.text());
      if (!result.ok) {
        this.showPlanTransferStatus('error', result.message);
        return;
      }

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
      const result = this.store.importPlanSharePayload(payload);
      if (!result.ok) {
        this.showPlanTransferStatus('error', result.message);
        return false;
      }

      clearPlannerShareCodeFromLocation();
      this.showPlanImportResult(result.project.name, result.warnings);
      return true;
    } catch (error) {
      this.showPlanTransferStatus('error', `${sourceLabel} could not be imported. ${shareErrorMessage(error)}`);
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

function blurFocusedGraphNode(): void {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return;
  }
  if (activeElement.closest('.production-node')) {
    activeElement.blur();
  }
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
