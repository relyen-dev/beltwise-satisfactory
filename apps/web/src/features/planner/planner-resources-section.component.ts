import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { PlannerStoreService } from './planner-store.service';
import { parsePlannerNumber } from './planner-ui.helpers';

@Component({
  selector: 'bw-planner-resources-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planner-resources-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerResourcesSectionComponent {
  public readonly store = inject(PlannerStoreService);

  public setResourceCap(itemId: ItemId, value: string | number | null): void {
    this.store.setResourceCap(itemId, parsePlannerNumber(value));
  }
}
