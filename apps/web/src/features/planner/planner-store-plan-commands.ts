import { type Signal } from '@angular/core';
import { type GameDataset, type Item, type ItemId, type RecipeId } from '@beltwise/game-data';
import {
  createStableId,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { defaultResourceCapPerMinute } from './planner-domain.helpers';
import * as projectMutations from './planner-project-mutations';

interface PlannerPlanCommandSliceOptions {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly itemOptions: Signal<readonly Item[]>;
  readonly planLocked: () => boolean;
  readonly updateActiveProject: (mapper: (project: PlannerProject) => PlannerProject) => void;
}

export class PlannerPlanCommandSlice {
  public constructor(private readonly options: PlannerPlanCommandSliceOptions) {}

  public addTarget(): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.addDraftTarget(project, createStableTargetId()),
    );
  }

  public duplicateTarget(target: ProductTarget): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.duplicateTarget(project, target, createStableTargetId()),
    );
  }

  public removeTarget(targetId: string): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) => projectMutations.removeTarget(project, targetId));
  }

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setTargetItem(project, targetId, itemId),
    );
  }

  public updateTargetMode(targetId: string, mode: ProductTarget['mode']): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setTargetMode(project, targetId, mode),
    );
  }

  public updateTargetAmount(targetId: string, amountPerMinute: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setTargetAmount(project, targetId, amountPerMinute),
    );
  }

  public setRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setRecipeEnabled(project, recipeId, enabled),
    );
  }

  public setRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    if (this.options.planLocked() || recipeIds.length === 0) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setRecipeGroupEnabled(project, recipeIds, enabled),
    );
  }

  public setRecipeGroupEnabled(isAlternate: boolean, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }

    const recipeIds = Object.values(dataset.recipes)
      .filter((recipe) => recipe.isAlternate === isAlternate)
      .map((recipe) => recipe.id);

    this.options.updateActiveProject((project) =>
      projectMutations.setRecipeGroupEnabled(project, recipeIds, enabled),
    );
  }

  public setItemInput(itemId: ItemId, amountPerMinute: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setItemInput(project, itemId, amountPerMinute),
    );
  }

  public addExternalInput(): void {
    if (this.options.planLocked()) {
      return;
    }
    const project = this.options.activeProject();
    const item = this.options.itemOptions().find((candidate) => !project?.itemInputs[candidate.id]);
    if (!item) {
      return;
    }
    this.setItemInput(item.id, 10);
  }

  public updateExternalInputItem(previousItemId: ItemId, nextItemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    if (previousItemId === nextItemId) {
      return;
    }

    this.options.updateActiveProject((project) =>
      projectMutations.moveItemInput(project, previousItemId, nextItemId),
    );
  }

  public removeExternalInput(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.removeItemInput(project, itemId),
    );
  }

  public setResourceCap(itemId: ItemId, maxPerMinute: number): void {
    if (this.options.planLocked()) {
      return;
    }
    const dataset = this.options.dataset();
    const baselineCapPerMinute = dataset?.resources[itemId]
      ? defaultResourceCapPerMinute(dataset.resources[itemId])
      : undefined;
    this.options.updateActiveProject((project) =>
      projectMutations.setResourceCap(project, itemId, maxPerMinute, baselineCapPerMinute),
    );
  }

  public setResourceEnabled(itemId: ItemId, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    const dataset = this.options.dataset();
    const baselineCapPerMinute = dataset?.resources[itemId]
      ? defaultResourceCapPerMinute(dataset.resources[itemId])
      : undefined;

    this.options.updateActiveProject((project) =>
      projectMutations.setResourceEnabled(project, itemId, enabled, baselineCapPerMinute),
    );
  }

  public resetResource(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) => projectMutations.resetResource(project, itemId));
  }

  public resetAllResources(): void {
    if (this.options.planLocked()) {
      return;
    }
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }
    const resourceIds = Object.keys(dataset.resources);
    this.options.updateActiveProject((project) =>
      projectMutations.resetResources(project, resourceIds),
    );
  }

  public setAllResourcesEnabled(enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }

    this.options.updateActiveProject((project) =>
      projectMutations.setAllResourcesEnabled(project, Object.values(dataset.resources), enabled),
    );
  }

  public setMachineEnabled(machineId: string, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setMachineEnabled(project, machineId, enabled),
    );
  }

  public setObjectivePreset(presetId: ObjectivePresetId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setObjectivePreset(project, presetId),
    );
  }

  public setObjectiveWeight(key: projectMutations.ObjectiveWeightKey, value: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      projectMutations.setObjectiveWeight(project, key, value),
    );
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setMaxBeltTier(project, maxBeltTier),
    );
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setMaxPipeTier(project, maxPipeTier),
    );
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setRateDecimalPlaces(project, rateDecimalPlaces),
    );
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setGraphEdgeStyle(project, edgeStyle),
    );
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setShowTransportLabels(project, showTransportLabels),
    );
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setAnimateFlowLines(project, animateFlowLines),
    );
  }
}

function createStableTargetId(): string {
  return createStableId('target');
}
