import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerGraphStore } from '../state/planner-graph.store';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { InspectorSinkAction } from '../state/planner-inspector.selectors';

@Component({
  selector: 'bw-selected-node-inspector',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './selected-node-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectedNodeInspectorComponent {
  public readonly graph = inject(PlannerGraphStore);
  public readonly planConfig = inject(PlannerPlanConfigStore);

  public runSinkAction(action: InspectorSinkAction): void {
    if (action.kind === 'remove-rule') {
      this.planConfig.sinkCommands.remove(action.sinkRuleId);
      return;
    }
    this.planConfig.sinkCommands.toggleSurplus(action.itemId);
  }
}
