import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerStoreService } from '../state/planner-store.service';
import { SelectedNodeInspectorComponent } from './selected-node-inspector.component';

@Component({
  selector: 'bw-planner-inspector',
  standalone: true,
  imports: [CommonModule, GameIconComponent, SelectedNodeInspectorComponent],
  templateUrl: './planner-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInspectorComponent {
  public readonly store = inject(PlannerStoreService);
}
