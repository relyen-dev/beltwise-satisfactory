import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type RecipeId } from '@beltwise/game-data';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { type RecipeRow } from '../state/planner-store.selectors';
import {
  BASE_RECIPE_PANEL_DEFINITIONS,
  type BaseRecipePanelId,
  recipeRowsForBasePanel,
} from './planner-configuration-surface';

type RecipeWorkbenchPanel = 'base' | 'alternate';

@Component({
  selector: 'bw-planner-recipes-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-recipes-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerRecipesSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
  public readonly activeRecipePanel = signal<RecipeWorkbenchPanel>('alternate');
  public readonly activeBaseRecipePanel = signal<BaseRecipePanelId>('standard');
  public readonly baseRecipePanelDefinitions = BASE_RECIPE_PANEL_DEFINITIONS;

  public readonly activeBaseRecipeRows = computed(() => {
    return recipeRowsForBasePanel(this.activeBaseRecipePanel(), {
      standard: this.planConfig.standardBaseRecipeRows(),
      converterResources: this.planConfig.converterResourceRecipeRows(),
    });
  });

  public baseRecipePanelRowCount(
    panelId: BaseRecipePanelId,
    standardRows: readonly RecipeRow[],
    converterResourceRows: readonly RecipeRow[],
  ): number {
    return recipeRowsForBasePanel(panelId, {
      standard: standardRows,
      converterResources: converterResourceRows,
    }).length;
  }

  public totalBaseRecipeRowCount(
    standardRows: readonly RecipeRow[],
    converterResourceRows: readonly RecipeRow[],
  ): number {
    return standardRows.length + converterResourceRows.length;
  }

  public setRowsEnabled(rows: readonly RecipeRow[], enabled: boolean): void {
    this.planConfig.recipeCommands.setManyEnabled(
      rows.map((row): RecipeId => row.recipe.id),
      enabled,
    );
  }
}
