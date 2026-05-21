import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { parsePlannerNumber } from '../shared-ui/planner-ui.helpers';

@Component({
  selector: 'bw-planner-resources-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-resources-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerResourcesSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);

  public setResourceCap(itemId: ItemId, value: string | number | null): void {
    this.planConfig.resourceCommands.setCap(itemId, parsePlannerNumber(value));
  }
}
