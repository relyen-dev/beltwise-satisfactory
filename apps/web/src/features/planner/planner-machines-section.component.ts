import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlannerStoreService } from './planner-store.service';

@Component({
  selector: 'bw-planner-machines-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planner-machines-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerMachinesSectionComponent {
  public readonly store = inject(PlannerStoreService);
}
