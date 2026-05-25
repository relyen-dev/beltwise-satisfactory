import { type Signal } from '@angular/core';
import {
  type GameDataset,
  type Item,
  type ItemId,
  type MachineId,
  type RecipeId,
} from '@beltwise/game-data';
import {
  buildGeneratorFuelCatalog,
  createStableId,
  defaultResourceCapPerMinute,
  mutatePlanGraph,
  mutatePlanItemInputs,
  mutatePlanMetadata,
  mutatePlanObjective,
  mutatePlanOverrides,
  mutatePlanPowerTargets,
  mutatePlanSinkRules,
  mutatePlanTargets,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  isSinkableItem,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type PowerTarget,
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

  public reorderTargets(targetIds: readonly string[]): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanTargets(project, { type: 'reorder-targets', targetIds }),
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

  public addPowerTarget(): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, {
        type: 'add-draft-power-target',
        powerTargetId: createStablePowerTargetId(),
      }),
    );
  }

  public duplicatePowerTarget(powerTarget: PowerTarget): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, {
        type: 'duplicate-power-target',
        powerTarget,
        powerTargetId: createStablePowerTargetId(),
      }),
    );
  }

  public removePowerTarget(powerTargetId: string): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, { type: 'remove-power-target', powerTargetId }),
    );
  }

  public reorderPowerTargets(powerTargetIds: readonly string[]): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, { type: 'reorder-power-targets', powerTargetIds }),
    );
  }

  public updatePowerTargetMode(powerTargetId: string, mode: PowerTarget['mode']): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, { type: 'set-power-target-mode', powerTargetId, mode }),
    );
  }

  public updatePowerTargetGenerator(
    powerTargetId: string,
    generatorId: MachineId | undefined,
  ): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) => {
      const currentTarget = project.powerTargets.find((target) => target.id === powerTargetId);
      if (!currentTarget) {
        return project;
      }

      const nextProject = mutatePlanPowerTargets(project, {
        type: 'set-power-target-generator',
        powerTargetId,
        generatorId,
      });
      if (
        currentTarget.fuelItemId === undefined ||
        this.powerFuelMatchesGenerator(generatorId, currentTarget.fuelItemId)
      ) {
        return nextProject;
      }

      return mutatePlanPowerTargets(nextProject, {
        type: 'set-power-target-fuel',
        powerTargetId,
        fuelItemId: undefined,
      });
    });
  }

  public updatePowerTargetFuel(powerTargetId: string, fuelItemId: ItemId | undefined): void {
    if (this.options.planLocked()) {
      return;
    }

    const target = this.options
      .activeProject()
      ?.powerTargets.find((candidate) => candidate.id === powerTargetId);
    if (
      fuelItemId !== undefined &&
      !this.powerFuelMatchesGenerator(target?.generatorId, fuelItemId)
    ) {
      return;
    }

    this.options.updateActiveProject((project) =>
      mutatePlanPowerTargets(project, {
        type: 'set-power-target-fuel',
        powerTargetId,
        fuelItemId,
      }),
    );
  }

  public updatePowerTargetAmount(powerTargetId: string, amount: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) => {
      const target = project.powerTargets.find((candidate) => candidate.id === powerTargetId);
      if (!target) {
        return project;
      }
      return mutatePlanPowerTargets(
        project,
        target.mode === 'power'
          ? { type: 'set-power-target-power-mw', powerTargetId, powerMw: amount }
          : { type: 'set-power-target-generator-count', powerTargetId, generatorCount: amount },
      );
    });
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

  public addSurplusSink(itemId: ItemId): void {
    if (this.options.planLocked() || !this.canSinkItem(itemId)) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanSinkRules(project, {
        type: 'add-surplus-sink',
        sinkRuleId: createStableSinkRuleId(),
        itemId,
      }),
    );
  }

  public removeSinkRule(sinkRuleId: string): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanSinkRules(project, { type: 'remove-sink-rule', sinkRuleId }),
    );
  }

  public removeSurplusSinkForItem(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanSinkRules(project, { type: 'remove-surplus-sink-for-item', itemId }),
    );
  }

  public toggleSurplusSink(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    const project = this.options.activeProject();
    if (project?.sinkRules.some((rule) => rule.mode === 'surplus' && rule.itemId === itemId)) {
      this.removeSurplusSinkForItem(itemId);
      return;
    }
    this.addSurplusSink(itemId);
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

  public setMachineEnabled(machineId: MachineId, enabled: boolean): void {
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

  public setObjectiveRawResourceMultiplier(itemId: ItemId, value: number): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanObjective(project, {
        type: 'set-objective-raw-resource-multiplier',
        itemId,
        value,
      }),
    );
  }

  public resetObjectiveRawResourceMultiplier(itemId: ItemId): void {
    if (this.options.planLocked()) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanObjective(project, {
        type: 'reset-objective-raw-resource-multiplier',
        itemId,
      }),
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

  private canSinkItem(itemId: ItemId): boolean {
    const dataset = this.options.dataset();
    return dataset !== null && isSinkableItem(dataset, itemId);
  }

  private powerFuelMatchesGenerator(
    generatorId: MachineId | undefined,
    fuelItemId: ItemId,
  ): boolean {
    if (generatorId === undefined) {
      return false;
    }

    const dataset = this.options.dataset();
    if (!dataset) {
      return true;
    }

    return buildGeneratorFuelCatalog(dataset).some(
      (row) => row.generatorId === generatorId && row.fuelItemId === fuelItemId,
    );
  }
}

function createStableTargetId(): string {
  return createStableId('target');
}

function createStablePowerTargetId(): string {
  return createStableId('power-target');
}

function createStableSinkRuleId(): string {
  return createStableId('sink');
}
