import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { PlannerStoreService } from '../state/planner-store.service';
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
  public readonly store = inject(PlannerStoreService);

  public readonly configuredTargetCount = computed(() => {
    return countConfiguredTargets(this.store.activeProject()?.targets ?? []);
  });

  public readonly targets = computed(() => {
    return this.store.activeProject()?.targets ?? [];
  });

  public readonly planNotes = computed(() => {
    return this.store.activeProject()?.notes ?? '';
  });

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    this.store.updateTargetItem(targetId, itemId);
  }

  public updateTargetAmount(targetId: string, value: string | number | null): void {
    this.store.updateTargetAmount(targetId, parsePlannerNumber(value));
  }
}
