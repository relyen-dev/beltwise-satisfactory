import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerGraphStore } from '../state/planner-graph.store';

@Component({
  selector: 'bw-selected-node-inspector',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './selected-node-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectedNodeInspectorComponent {
  public readonly graph = inject(PlannerGraphStore);
}
