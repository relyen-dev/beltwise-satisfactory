import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerGraphStore } from '../state/planner-graph.store';
import { PlannerFactoryLinksStore } from '../state/planner-factory-links.store';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { InspectorSinkAction } from '../state/planner-inspector.selectors';
import { PlannerWorkbenchSlice } from './planner-workbench-state';

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
  private readonly factoryLinks = inject(PlannerFactoryLinksStore);
  private readonly workbench = inject(PlannerWorkbenchSlice);

  public runSinkAction(action: InspectorSinkAction): void {
    if (action.kind === 'remove-rule') {
      this.planConfig.sinkCommands.remove(action.sinkRuleId);
      return;
    }
    this.planConfig.sinkCommands.toggleSurplus(action.itemId);
  }

  public startFactoryLink(targetId: string | null, itemId: string): void {
    if (!targetId || itemId.length === 0) {
      return;
    }
    this.factoryLinks.startDraftFromTarget({ targetId, itemId });
    this.workbench.requestOpenPanel('links');
  }
}
