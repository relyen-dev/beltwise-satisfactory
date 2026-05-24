import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { type ItemId } from '@beltwise/game-data';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';

@Component({
  selector: 'bw-planner-sinks-section',
  standalone: true,
  imports: [GameIconComponent, TargetItemPickerComponent],
  templateUrl: './planner-sinks-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerSinksSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);

  public addSurplusSink(itemId: ItemId): void {
    if (this.planConfig.editingLocked() || itemId.length === 0) {
      return;
    }
    this.planConfig.sinkCommands.addSurplus(itemId);
  }

  public amountLabel(amountPerMinute: number): string {
    return `${formatPlannerNumber(amountPerMinute)}/min`;
  }

  public sinkPointsLabel(pointsPerMinute: number | null): string {
    return pointsPerMinute === null ? 'Not sinkable' : `${formatPlannerNumber(pointsPerMinute)}/min`;
  }

  public addPickerLabel(): string {
    return this.planConfig.availableSurplusSinkItems().length === 0
      ? 'No sinkable items'
      : 'Add surplus sink';
  }
}
