import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type ItemId } from '@beltwise/game-data';
import {
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
} from '@beltwise/planner-core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import {
  parsePlannerNumber,
  parseRawResourceMultiplierInput,
} from '../shared-ui/planner-ui.helpers';
import {
  activeObjectivePresetDescription,
  activeObjectivePresetId,
  activeObjectivePresetLabel,
  objectiveWeightValue,
  OBJECTIVE_WEIGHT_CONTROLS,
  PLANNER_OBJECTIVE_PRESETS,
  RAW_RESOURCE_COST_FORMULA_LABEL,
  RAW_RESOURCE_COST_HELP_TEXT,
} from './planner-configuration-surface';

type ObjectiveWorkbenchPanel = 'solver' | 'resources';

@Component({
  selector: 'bw-planner-objectives-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-objectives-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerObjectivesSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
  public readonly activeObjectivePanel = signal<ObjectiveWorkbenchPanel>('solver');
  public readonly presets = PLANNER_OBJECTIVE_PRESETS;
  public readonly weightControls = OBJECTIVE_WEIGHT_CONTROLS;
  public readonly rawResourceCostFormulaLabel = RAW_RESOURCE_COST_FORMULA_LABEL;
  public readonly rawResourceCostHelpText = RAW_RESOURCE_COST_HELP_TEXT;

  public activePresetId(profile: ObjectiveProfile): ObjectivePresetId {
    return activeObjectivePresetId(profile);
  }

  public activePresetLabel(profile: ObjectiveProfile): string {
    return activeObjectivePresetLabel(profile);
  }

  public activePresetDescription(profile: ObjectiveProfile): string {
    return activeObjectivePresetDescription(profile);
  }

  public weightValue(profile: ObjectiveProfile, key: ObjectiveWeightKey): number {
    return objectiveWeightValue(profile, key);
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: string | number | null): void {
    this.planConfig.objectiveCommands.setWeight(key, parsePlannerNumber(value));
  }

  public setRawResourceMultiplier(itemId: ItemId, value: string | number | null): void {
    this.planConfig.objectiveCommands.setRawResourceMultiplier(
      itemId,
      parseRawResourceMultiplierInput(value),
    );
  }

  public resetRawResourceMultiplier(itemId: ItemId): void {
    this.planConfig.objectiveCommands.resetRawResourceMultiplier(itemId);
  }
}
