import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type RecipeId } from '@beltwise/game-data';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { PlannerStoreService } from '../state/planner-store.service';
import { type RecipeRow } from '../state/planner-store.selectors';

type BaseRecipePanel = 'standard' | 'converterResources';

@Component({
  selector: 'bw-planner-recipes-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent],
  templateUrl: './planner-recipes-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerRecipesSectionComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly activeBaseRecipePanel = signal<BaseRecipePanel>('standard');

  public readonly activeBaseRecipeRows = computed(() => {
    return this.activeBaseRecipePanel() === 'converterResources'
      ? this.store.converterResourceRecipeRows()
      : this.store.standardBaseRecipeRows();
  });

  public setRowsEnabled(rows: readonly RecipeRow[], enabled: boolean): void {
    this.store.setRecipesEnabled(
      rows.map((row): RecipeId => row.recipe.id),
      enabled,
    );
  }
}
