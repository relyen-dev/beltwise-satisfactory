import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  OBJECTIVE_PRESET_DEFINITIONS,
  objectivePresetDefinition,
  resolveObjectivePresetId,
  type ObjectivePresetId,
  type ObjectiveProfile,
} from '@beltwise/planner-core';
import { PlannerStoreService } from './planner-store.service';
import { parsePlannerNumber } from './planner-ui.helpers';
import { type ObjectiveWeightKey } from './planner-project-mutations';

interface ObjectiveWeightControl {
  key: ObjectiveWeightKey;
  label: string;
  step: number;
}

@Component({
  selector: 'bw-planner-objectives-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
}
