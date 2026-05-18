import { type Signal } from '@angular/core';
import { type GameDataset, type Item, type ItemId, type RecipeId } from '@beltwise/game-data';
import {
  createStableId,
  defaultResourceCapPerMinute,
  mutatePlanGraph,
  mutatePlanItemInputs,
  mutatePlanMetadata,
  mutatePlanObjective,
  mutatePlanOverrides,
  mutatePlanTargets,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';

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
      mutatePlanTargets(project, { type: 'add-draft-target', targetId: createStableTargetId() }),
    );
  }

  public duplicateTarget(target: ProductTarget): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, {
        type: 'duplicate-target',
        target,
        targetId: createStableTargetId(),
      }),
    );
  }

  public removeTarget(targetId: string): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, { type: 'remove-target', targetId }),
    );
  }

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, { type: 'set-target-item', targetId, itemId }),
    );
  }

  public updateTargetMode(targetId: string, mode: ProductTarget['mode']): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, { type: 'set-target-mode', targetId, mode }),
    );
  }

  public updateTargetAmount(targetId: string, amountPerMinute: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, { type: 'set-target-amount', targetId, amountPerMinute }),
    );
  }

  public setRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanOverrides(project, { type: 'set-recipe-enabled', recipeId, enabled }),
    );
  }

  public setRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    if (this.options.planLocked() || recipeIds.length === 0) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanOverrides(project, { type: 'set-recipe-group-enabled', recipeIds, enabled }),
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
      mutatePlanOverrides(project, { type: 'set-recipe-group-enabled', recipeIds, enabled }),
    );
  }

  public setItemInput(itemId: ItemId, amountPerMinute: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanItemInputs(project, { type: 'set-item-input', itemId, amountPerMinute }),
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
      mutatePlanItemInputs(project, { type: 'move-item-input', previousItemId, nextItemId }),
    );
  }

  public removeExternalInput(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanItemInputs(project, { type: 'remove-item-input', itemId }),
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
      mutatePlanOverrides(project, {
        type: 'set-resource-cap',
        itemId,
        maxPerMinute,
        baselineCapPerMinute,
      }),
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
      mutatePlanOverrides(project, {
        type: 'set-resource-enabled',
        itemId,
        enabled,
        baselineCapPerMinute,
      }),
    );
  }

  public resetResource(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanOverrides(project, { type: 'reset-resource', itemId }),
    );
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
      mutatePlanOverrides(project, { type: 'reset-resources', resourceIds }),
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
      mutatePlanOverrides(project, {
        type: 'set-all-resources-enabled',
        resources: Object.values(dataset.resources),
        enabled,
      }),
    );
  }

  public setMachineEnabled(machineId: string, enabled: boolean): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanOverrides(project, { type: 'set-machine-enabled', machineId, enabled }),
    );
  }

  public setObjectivePreset(presetId: ObjectivePresetId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanObjective(project, { type: 'set-objective-preset', presetId }),
    );
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanObjective(project, { type: 'set-objective-weight', key, value }),
    );
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { maxBeltTier } }),
    );
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { maxPipeTier } }),
    );
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { rateDecimalPlaces } }),
    );
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { edgeStyle } }),
    );
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { showTransportLabels } }),
    );
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-display', patch: { animateFlowLines } }),
    );
  }

  public setPlanNotes(notes: string): void {
    this.options.updateActiveProject((project) =>
      mutatePlanMetadata(project, { type: 'set-notes', notes }),
    );
  }
}

function createStableTargetId(): string {
  return createStableId('target');
}
