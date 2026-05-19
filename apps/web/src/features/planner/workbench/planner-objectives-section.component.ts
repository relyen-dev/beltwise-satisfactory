import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type ItemId } from '@beltwise/game-data';
import {
  OBJECTIVE_PRESET_DEFINITIONS,
  objectivePresetDefinition,
  resolveObjectivePresetId,
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
} from '@beltwise/planner-core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerStoreService } from '../state/planner-store.service';
import {
  parsePlannerNumber,
  parseRawResourceMultiplierInput,
} from '../shared-ui/planner-ui.helpers';

interface ObjectiveWeightControl {
  key: ObjectiveWeightKey;
  label: string;
  step: number;
}

@Component({
  selector: 'bw-planner-objectives-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-objectives-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerObjectivesSectionComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly presets = OBJECTIVE_PRESET_DEFINITIONS;
  public readonly weightControls: readonly ObjectiveWeightControl[] = [
    { key: 'resourceScarcityWeight', label: 'Raw resources', step: 0.05 },
    { key: 'powerWeight', label: 'Power', step: 0.05 },
    { key: 'machineCountWeight', label: 'Machines', step: 0.05 },
    { key: 'surplusWeight', label: 'Surplus', step: 0.05 },
  ];

  public activePresetId(profile: ObjectiveProfile): ObjectivePresetId {
    return resolveObjectivePresetId(profile);
  }

  public activePresetLabel(profile: ObjectiveProfile): string {
    return objectivePresetDefinition(this.activePresetId(profile)).label;
  }

  public activePresetDescription(profile: ObjectiveProfile): string {
    return objectivePresetDefinition(this.activePresetId(profile)).description;
  }

  public weightValue(profile: ObjectiveProfile, key: ObjectiveWeightKey): number {
    return profile[key];
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: string | number | null): void {
    this.store.setObjectiveWeight(key, parsePlannerNumber(value));
  }

  public setRawResourceMultiplier(itemId: ItemId, value: string | number | null): void {
    this.store.setObjectiveRawResourceMultiplier(itemId, parseRawResourceMultiplierInput(value));
  }

  public resetRawResourceMultiplier(itemId: ItemId): void {
    this.store.resetObjectiveRawResourceMultiplier(itemId);
  }
}
