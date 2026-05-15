import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlannerStoreService } from './planner-store.service';

@Component({
  selector: 'bw-selected-node-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './selected-node-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectedNodeInspectorComponent {
  public readonly store = inject(PlannerStoreService);
}
