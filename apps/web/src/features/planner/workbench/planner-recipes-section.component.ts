import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
type RecipeTooltipPlacement = 'above' | 'below';

interface ActiveRecipeTooltip {
  readonly row: RecipeRow;
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly placement: RecipeTooltipPlacement;
}

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
  public readonly activeRecipeTooltip = signal<ActiveRecipeTooltip | null>(null);
  private readonly recipeList = viewChild<ElementRef<HTMLElement>>('recipeList');

  public readonly activeBaseRecipeRows = computed(() => {
    return recipeRowsForBasePanel(this.activeBaseRecipePanel(), {
      standard: this.planConfig.standardBaseRecipeRows(),
      unlocks: this.planConfig.unlockRecipeRows(),
      converterResources: this.planConfig.converterResourceRecipeRows(),
    });
  });

  public baseRecipePanelRowCount(
    panelId: BaseRecipePanelId,
    standardRows: readonly RecipeRow[],
    unlockRows: readonly RecipeRow[],
    converterResourceRows: readonly RecipeRow[],
  ): number {
    return recipeRowsForBasePanel(panelId, {
      standard: standardRows,
      unlocks: unlockRows,
      converterResources: converterResourceRows,
    }).length;
  }

  public totalBaseRecipeRowCount(
    standardRows: readonly RecipeRow[],
    unlockRows: readonly RecipeRow[],
    converterResourceRows: readonly RecipeRow[],
  ): number {
    return standardRows.length + unlockRows.length + converterResourceRows.length;
  }

  public selectRecipePanel(panel: RecipeWorkbenchPanel): void {
    if (this.activeRecipePanel() === panel) {
      return;
    }

    this.hideRecipeTooltip();
    this.activeRecipePanel.set(panel);
    this.scrollRecipeListToTopAfterRender();
  }

  public selectBaseRecipePanel(panelId: BaseRecipePanelId): void {
    if (this.activeBaseRecipePanel() === panelId) {
      return;
    }

    this.hideRecipeTooltip();
    this.activeBaseRecipePanel.set(panelId);
    this.scrollRecipeListToTopAfterRender();
  }

  public setRecipeSearch(search: string): void {
    this.hideRecipeTooltip();
    this.planConfig.recipeSearch.set(search);
  }

  public setRowsEnabled(rows: readonly RecipeRow[], enabled: boolean): void {
    this.planConfig.recipeCommands.setManyEnabled(
      rows.map((row): RecipeId => row.recipe.id),
      enabled,
    );
  }

  public showRecipeTooltip(row: RecipeRow, rowElement: HTMLElement): void {
    const rect = rowElement.getBoundingClientRect();
    const viewport = rowElement.ownerDocument.defaultView;
    const viewportWidth = viewport?.innerWidth ?? rect.right;
    const viewportHeight = viewport?.innerHeight ?? rect.bottom;
    const marginPx = 12;
    const preferredWidthPx = Math.min(420, Math.max(230, rect.width - 58));
    const maxLeftPx = Math.max(marginPx, viewportWidth - preferredWidthPx - marginPx);
    const leftPx = clamp(rect.left + 48, marginPx, maxLeftPx);
    const belowSpacePx = viewportHeight - rect.bottom;
    const aboveSpacePx = rect.top;
    const placement: RecipeTooltipPlacement =
      belowSpacePx < 220 && aboveSpacePx > belowSpacePx ? 'above' : 'below';
    const topPx = placement === 'above' ? rect.top - 7 : rect.bottom + 7;

    this.activeRecipeTooltip.set({
      row,
      leftPx,
      topPx: clamp(topPx, marginPx, viewportHeight - marginPx),
      widthPx: preferredWidthPx,
      placement,
    });
  }

  public hideRecipeTooltip(): void {
    this.activeRecipeTooltip.set(null);
  }

  private scrollRecipeListToTopAfterRender(attempts = 4): void {
    setTimeout(() => {
      const target = this.recipeList()?.nativeElement;
      if (target) {
        target.scrollTop = 0;
        target.scrollLeft = 0;
        return;
      }

      if (attempts > 0) {
        this.scrollRecipeListToTopAfterRender(attempts - 1);
      }
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
