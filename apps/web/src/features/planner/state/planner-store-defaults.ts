import { type Signal } from '@angular/core';
import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  defaultResourceCapPerMinute,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type PlannerUserDefaults,
  type RateDecimalPlaces,
  resetAllDefaultResources,
  resetDefaultResource,
  resetUserDefaultsToBuiltIns,
  saveProjectSettingsAsDefaults,
  setAllDefaultResourcesEnabled,
  setDefaultAnimateFlowLines,
  setDefaultGraphEdgeStyle,
  setDefaultMachineEnabled,
  setDefaultMachinesEnabled,
  setDefaultMaxBeltTier,
  setDefaultMaxPipeTier,
  setDefaultObjectivePreset,
  setDefaultObjectiveWeight,
  setDefaultRateDecimalPlaces,
  setDefaultRecipeEnabled,
  setDefaultRecipesEnabled,
  setDefaultResourceCap,
  setDefaultResourceEnabled,
  setDefaultShowTransportLabels,
} from '@beltwise/planner-core';

interface PlannerDefaultsCommandSliceOptions {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly updateUserDefaults: (
    mapper: (userDefaults: PlannerUserDefaults, dataset: GameDataset) => PlannerUserDefaults,
  ) => void;
}

export class PlannerDefaultsCommandSlice {
  public constructor(private readonly options: PlannerDefaultsCommandSliceOptions) {}

  public setRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultRecipeEnabled(userDefaults, recipeId, enabled),
    );
  }

  public setRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    if (recipeIds.length === 0) {
      return;
    }
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultRecipesEnabled(userDefaults, recipeIds, enabled),
    );
  }

  public setMachineEnabled(machineId: MachineId, enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultMachineEnabled(userDefaults, machineId, enabled),
    );
  }

  public setMachinesEnabled(machineIds: readonly MachineId[], enabled: boolean): void {
    if (machineIds.length === 0) {
      return;
    }
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultMachinesEnabled(userDefaults, machineIds, enabled),
    );
  }

  public setResourceCap(itemId: ItemId, maxPerMinute: number): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      setDefaultResourceCap(
        userDefaults,
        itemId,
        maxPerMinute,
        baselineResourceCapPerMinute(dataset, itemId),
      ),
    );
  }

  public setResourceEnabled(itemId: ItemId, enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      setDefaultResourceEnabled(
        userDefaults,
        itemId,
        enabled,
        baselineResourceCapPerMinute(dataset, itemId),
      ),
    );
  }

  public resetResource(itemId: ItemId): void {
    this.options.updateUserDefaults((userDefaults) =>
      resetDefaultResource(userDefaults, itemId),
    );
  }

  public resetAllResources(): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      resetAllDefaultResources(userDefaults, Object.keys(dataset.resources)),
    );
  }

  public setAllResourcesEnabled(enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      setAllDefaultResourcesEnabled(
        userDefaults,
        Object.values(dataset.resources),
        enabled,
      ),
    );
  }

  public setObjectivePreset(presetId: ObjectivePresetId): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultObjectivePreset(userDefaults, presetId),
    );
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: number): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultObjectiveWeight(userDefaults, key, value),
    );
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultMaxBeltTier(userDefaults, maxBeltTier),
    );
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultMaxPipeTier(userDefaults, maxPipeTier),
    );
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultRateDecimalPlaces(userDefaults, rateDecimalPlaces),
    );
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultGraphEdgeStyle(userDefaults, edgeStyle),
    );
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultShowTransportLabels(userDefaults, showTransportLabels),
    );
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      setDefaultAnimateFlowLines(userDefaults, animateFlowLines),
    );
  }

  public saveActivePlanAsDefaults(): void {
    const project = this.options.activeProject();
    if (!project) {
      return;
    }
    this.options.updateUserDefaults(() => saveProjectSettingsAsDefaults(project));
  }

  public resetUserDefaults(): void {
    this.options.updateUserDefaults((_userDefaults, dataset) =>
      resetUserDefaultsToBuiltIns(dataset),
    );
  }
}

function baselineResourceCapPerMinute(dataset: GameDataset, itemId: ItemId): number | undefined {
  const resource = dataset.resources[itemId];
  return resource ? defaultResourceCapPerMinute(resource) : undefined;
}
