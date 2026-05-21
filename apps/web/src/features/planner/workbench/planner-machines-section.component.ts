import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';

@Component({
  selector: 'bw-planner-machines-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-machines-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerMachinesSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
}
