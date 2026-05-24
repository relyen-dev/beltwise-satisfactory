import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';

@Component({
  selector: 'bw-planner-sinks-section',
  standalone: true,
  imports: [GameIconComponent],
  templateUrl: './planner-sinks-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerSinksSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);

  public amountLabel(amountPerMinute: number): string {
    return `${formatPlannerNumber(amountPerMinute)}/min`;
  }

  public sinkPointsLabel(pointsPerMinute: number | null): string {
    return pointsPerMinute === null ? 'Not sinkable' : `${formatPlannerNumber(pointsPerMinute)}/min`;
  }
}
