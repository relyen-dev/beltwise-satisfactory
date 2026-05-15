import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlannerStoreService } from './planner-store.service';
import { SelectedNodeInspectorComponent } from './selected-node-inspector.component';

@Component({
  selector: 'bw-planner-inspector',
  standalone: true,
  imports: [CommonModule, SelectedNodeInspectorComponent],
  templateUrl: './planner-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInspectorComponent {
  public readonly store = inject(PlannerStoreService);
}
