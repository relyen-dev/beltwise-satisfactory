import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerGraphStore } from '../state/planner-graph.store';
import { PlannerSolverService } from '../solving/planner-solver.service';
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
  imports: [GameIconComponent, SelectedNodeInspectorComponent],
  templateUrl: './planner-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInspectorComponent {
  public readonly graph = inject(PlannerGraphStore);
  public readonly solver = inject(PlannerSolverService);
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
