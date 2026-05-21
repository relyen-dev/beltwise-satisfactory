import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
} from '@beltwise/planner-core';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerStoreService } from '../state/planner-store.service';
import { type MachineRow, type RecipeRow } from '../state/planner-store.selectors';
import {
  parsePlannerNumber,
  parseRawResourceMultiplierInput,
} from '../shared-ui/planner-ui.helpers';
import {
  activeObjectivePresetId,
  activeObjectivePresetLabel,
  DEFAULT_RECIPE_PANEL_DEFINITIONS,
  type DefaultRecipePanelId,
  GRAPH_DISPLAY_BELT_TIER_OPTIONS,
  GRAPH_DISPLAY_EDGE_STYLE_OPTIONS,
  GRAPH_DISPLAY_PIPE_TIER_OPTIONS,
  GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS,
  objectiveWeightValue,
  OBJECTIVE_WEIGHT_CONTROLS,
  PLANNER_OBJECTIVE_PRESETS,
  recipeRowsForDefaultPanel,
} from './planner-configuration-surface';

type DefaultsPanelTab = 'recipes' | 'machines' | 'resources' | 'objectives' | 'display';

interface DefaultsPanelTabDefinition {
  id: DefaultsPanelTab;
  label: string;
}

@Component({
  selector: 'bw-planner-defaults-panel',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-defaults-panel.component.html',
  styleUrl: './planner-defaults-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerDefaultsPanelComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly closed = output<void>();
  public readonly activeTab = signal<DefaultsPanelTab>('recipes');
  public readonly activeRecipePanel = signal<DefaultRecipePanelId>('standard');
  public readonly tabs: readonly DefaultsPanelTabDefinition[] = [
    { id: 'recipes', label: 'Recipes' },
    { id: 'machines', label: 'Machines' },
    { id: 'resources', label: 'Resources' },
    { id: 'objectives', label: 'Objectives' },
    { id: 'display', label: 'Display' },
  ];
  public readonly recipePanelDefinitions = DEFAULT_RECIPE_PANEL_DEFINITIONS;

  public readonly activeRecipeRows = computed(() => {
    return recipeRowsForDefaultPanel(this.activeRecipePanel(), {
      standard: this.store.workbenchViews.defaultStandardBaseRecipeRows(),
      converterResources: this.store.workbenchViews.defaultConverterResourceRecipeRows(),
      alternates: this.store.workbenchViews.defaultAlternateRecipeRows(),
    });
  });

  public readonly beltTierOptions = GRAPH_DISPLAY_BELT_TIER_OPTIONS;
  public readonly pipeTierOptions = GRAPH_DISPLAY_PIPE_TIER_OPTIONS;
  public readonly rateDecimalOptions = GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS;
  public readonly edgeStyleOptions = GRAPH_DISPLAY_EDGE_STYLE_OPTIONS;
  public readonly objectivePresets = PLANNER_OBJECTIVE_PRESETS;
  public readonly objectiveWeightControls = OBJECTIVE_WEIGHT_CONTROLS;

  public recipePanelRowCount(
    panelId: DefaultRecipePanelId,
    standardRows: readonly RecipeRow[],
    converterResourceRows: readonly RecipeRow[],
    alternateRows: readonly RecipeRow[],
  ): number {
    return recipeRowsForDefaultPanel(panelId, {
      standard: standardRows,
      converterResources: converterResourceRows,
      alternates: alternateRows,
    }).length;
  }

  public setRecipeRowsEnabled(rows: readonly RecipeRow[], enabled: boolean): void {
    this.store.setDefaultRecipesEnabled(
      rows.map((row): RecipeId => row.recipe.id),
      enabled,
    );
  }

  public setMachineRowsEnabled(rows: readonly MachineRow[], enabled: boolean): void {
    this.store.setDefaultMachinesEnabled(
      rows.map((row): MachineId => row.machine.id),
      enabled,
    );
  }

  public setResourceCap(itemId: ItemId, value: string | number | null): void {
    this.store.setDefaultResourceCap(itemId, parsePlannerNumber(value));
  }

  public activeObjectivePresetId(profile: ObjectiveProfile): ObjectivePresetId {
    return activeObjectivePresetId(profile);
  }

  public activeObjectivePresetLabel(profile: ObjectiveProfile): string {
    return activeObjectivePresetLabel(profile);
  }

  public weightValue(profile: ObjectiveProfile, key: ObjectiveWeightKey): number {
    return objectiveWeightValue(profile, key);
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: string | number | null): void {
    this.store.setDefaultObjectiveWeight(key, parsePlannerNumber(value));
  }

  public setRawResourceMultiplier(itemId: ItemId, value: string | number | null): void {
    this.store.setDefaultObjectiveRawResourceMultiplier(
      itemId,
      parseRawResourceMultiplierInput(value),
    );
  }

  public resetRawResourceMultiplier(itemId: ItemId): void {
    this.store.resetDefaultObjectiveRawResourceMultiplier(itemId);
  }
}
