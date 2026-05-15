import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductionGraphComponent } from '../graph/production-graph.component';
import { PlannerDisplaySectionComponent } from './planner-display-section.component';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerInspectorComponent } from './planner-inspector.component';
import { PlannerMachinesSectionComponent } from './planner-machines-section.component';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerResourcesSectionComponent } from './planner-resources-section.component';
import { PlannerStoreService, type ConfigurationTab } from './planner-store.service';
import { PlannerTargetsSectionComponent } from './planner-targets-section.component';

interface ConfigurationTabDefinition {
  id: ConfigurationTab;
  label: string;
}

@Component({
  selector: 'bw-planner-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
export class PlannerPageComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly workPanelOpen = signal(false);
  public readonly inspectorOpen = signal(true);
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

  public constructor() {
    effect(() => {
      const request = this.store.workbenchFocusRequest();
      if (!request) {
        return;
      }

      this.workPanelOpen.set(request.mode === 'open-plan');
    });
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

  @HostListener('window:beforeunload')
  @HostListener('window:pagehide')
  public flushGraphNodePositionsBeforeUnload(): void {
    this.store.flushGraphNodePositions();
  }

  @HostListener('document:keydown.escape', ['$event'])
  public clearGraphSelectionFromKeyboard(event: KeyboardEvent): void {
    if (!this.store.selectedGraphNodeId() || isEditableKeyboardTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.store.clearSelectedGraphNode();
    blurFocusedGraphNode();
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
