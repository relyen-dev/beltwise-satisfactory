import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type PipelineTier,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { GameIconComponent } from './game-icon.component';
import { PlannerStoreService } from './planner-store.service';
import { type MachineRow, type RecipeRow } from './planner-store.selectors';
import { parsePlannerNumber } from './planner-ui.helpers';

type DefaultsPanelTab = 'recipes' | 'machines' | 'resources' | 'display';
type RecipeDefaultsPanel = 'standard' | 'converterResources' | 'alternates';

interface DefaultsPanelTabDefinition {
  id: DefaultsPanelTab;
  label: string;
}

interface BeltTierOption {
  value: ConveyorBeltTier;
  label: string;
  capacityLabel: string;
}

interface PipeTierOption {
  value: PipelineTier;
  label: string;
  capacityLabel: string;
}

interface RateDecimalOption {
  value: RateDecimalPlaces;
  label: string;
}

interface EdgeStyleOption {
  value: GraphEdgeStyle;
  label: string;
}

@Component({
  selector: 'bw-planner-defaults-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, GameIconComponent],
  templateUrl: './planner-defaults-panel.component.html',
  styleUrl: './planner-defaults-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerDefaultsPanelComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly closed = output<void>();
  public readonly activeTab = signal<DefaultsPanelTab>('recipes');
  public readonly activeRecipePanel = signal<RecipeDefaultsPanel>('standard');
  public readonly tabs: readonly DefaultsPanelTabDefinition[] = [
    { id: 'recipes', label: 'Recipes' },
    { id: 'machines', label: 'Machines' },
    { id: 'resources', label: 'Resources' },
    { id: 'display', label: 'Display' },
  ];

  public readonly activeRecipeRows = computed(() => {
    switch (this.activeRecipePanel()) {
      case 'converterResources':
        return this.store.defaultConverterResourceRecipeRows();
      case 'alternates':
        return this.store.defaultAlternateRecipeRows();
      case 'standard':
        return this.store.defaultStandardBaseRecipeRows();
    }
  });

  public readonly beltTierOptions: readonly BeltTierOption[] = [
    { value: 1, label: 'Mk.1', capacityLabel: '60/min' },
    { value: 2, label: 'Mk.2', capacityLabel: '120/min' },
    { value: 3, label: 'Mk.3', capacityLabel: '270/min' },
    { value: 4, label: 'Mk.4', capacityLabel: '480/min' },
    { value: 5, label: 'Mk.5', capacityLabel: '780/min' },
    { value: 6, label: 'Mk.6', capacityLabel: '1200/min' },
  ];
  public readonly pipeTierOptions: readonly PipeTierOption[] = [
    { value: 1, label: 'Mk.1', capacityLabel: '300/min' },
    { value: 2, label: 'Mk.2', capacityLabel: '600/min' },
  ];
  public readonly rateDecimalOptions: readonly RateDecimalOption[] = [
    { value: 1, label: '1 decimal' },
    { value: 2, label: '2 decimals' },
    { value: 3, label: '3 decimals' },
    { value: 4, label: '4 decimals' },
  ];
  public readonly edgeStyleOptions: readonly EdgeStyleOption[] = [
    { value: 'straight', label: 'Straight lines' },
    { value: 'curved', label: 'Curved lines' },
  ];

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
}
