import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerStoreService } from '../state/planner-store.service';
import { SelectedNodeInspectorComponent } from './selected-node-inspector.component';

type InspectorOverviewSectionId =
  | 'objective'
  | 'notes'
  | 'targets'
  | 'raw-inputs'
  | 'external-inputs'
  | 'surplus'
  | 'machines';

@Component({
  selector: 'bw-planner-inspector',
  standalone: true,
  imports: [CommonModule, GameIconComponent, SelectedNodeInspectorComponent],
  templateUrl: './planner-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInspectorComponent {
  public readonly store = inject(PlannerStoreService);
  private readonly collapsedOverviewSections = signal<
    Readonly<Partial<Record<InspectorOverviewSectionId, boolean>>>
  >({});

  public isOverviewSectionCollapsed(
    sectionId: InspectorOverviewSectionId,
    defaultCollapsed = false,
  ): boolean {
    return this.collapsedOverviewSections()[sectionId] ?? defaultCollapsed;
  }

  public toggleOverviewSection(
    sectionId: InspectorOverviewSectionId,
    defaultCollapsed = false,
  ): void {
    const collapsed = !this.isOverviewSectionCollapsed(sectionId, defaultCollapsed);
    this.collapsedOverviewSections.update((sections) => ({ ...sections, [sectionId]: collapsed }));
  }
}
