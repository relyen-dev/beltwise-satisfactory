import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { countConfiguredTargets, parsePlannerNumber } from '../shared-ui/planner-ui.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';

@Component({
  selector: 'bw-planner-targets-section',
  standalone: true,
  imports: [FormsModule, TargetItemPickerComponent],
  templateUrl: './planner-targets-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerTargetsSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);

  public readonly configuredTargetCount = computed(() => {
    return countConfiguredTargets(this.planConfig.targetRows());
  });

  public readonly targets = this.planConfig.targetRows;
  public readonly planNotes = this.planConfig.planNotes;

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    this.planConfig.targetCommands.updateItem(targetId, itemId);
  }

  public updateTargetAmount(targetId: string, value: string | number | null): void {
    this.planConfig.targetCommands.updateAmount(targetId, parsePlannerNumber(value));
  }
}
