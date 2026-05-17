import { type Signal } from '@angular/core';
import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type PipelineTier,
  type PlannerProject,
  type PlannerUserDefaults,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { defaultResourceCapPerMinute } from './planner-domain.helpers';
import * as defaultsMutations from './planner-defaults-mutations';

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
      defaultsMutations.setDefaultRecipeEnabled(userDefaults, recipeId, enabled),
    );
  }

  public setRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    if (recipeIds.length === 0) {
      return;
    }
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultRecipesEnabled(userDefaults, recipeIds, enabled),
    );
  }

  public setMachineEnabled(machineId: MachineId, enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultMachineEnabled(userDefaults, machineId, enabled),
    );
  }

  public setMachinesEnabled(machineIds: readonly MachineId[], enabled: boolean): void {
    if (machineIds.length === 0) {
      return;
    }
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultMachinesEnabled(userDefaults, machineIds, enabled),
    );
  }

  public setResourceCap(itemId: ItemId, maxPerMinute: number): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      defaultsMutations.setDefaultResourceCap(
        userDefaults,
        itemId,
        maxPerMinute,
        baselineResourceCapPerMinute(dataset, itemId),
      ),
    );
  }

  public setResourceEnabled(itemId: ItemId, enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      defaultsMutations.setDefaultResourceEnabled(
        userDefaults,
        itemId,
        enabled,
        baselineResourceCapPerMinute(dataset, itemId),
      ),
    );
  }

  public resetResource(itemId: ItemId): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.resetDefaultResource(userDefaults, itemId),
    );
  }

  public resetAllResources(): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      defaultsMutations.resetAllDefaultResources(userDefaults, Object.keys(dataset.resources)),
    );
  }

  public setAllResourcesEnabled(enabled: boolean): void {
    this.options.updateUserDefaults((userDefaults, dataset) =>
      defaultsMutations.setAllDefaultResourcesEnabled(
        userDefaults,
        Object.values(dataset.resources),
        enabled,
      ),
    );
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultMaxBeltTier(userDefaults, maxBeltTier),
    );
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultMaxPipeTier(userDefaults, maxPipeTier),
    );
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultRateDecimalPlaces(userDefaults, rateDecimalPlaces),
    );
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultGraphEdgeStyle(userDefaults, edgeStyle),
    );
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultShowTransportLabels(userDefaults, showTransportLabels),
    );
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.options.updateUserDefaults((userDefaults) =>
      defaultsMutations.setDefaultAnimateFlowLines(userDefaults, animateFlowLines),
    );
  }

  public saveActivePlanAsDefaults(): void {
    const project = this.options.activeProject();
    if (!project) {
      return;
    }
    this.options.updateUserDefaults(() => defaultsMutations.saveProjectSettingsAsDefaults(project));
  }

  public resetUserDefaults(): void {
    this.options.updateUserDefaults((_userDefaults, dataset) =>
      defaultsMutations.resetUserDefaultsToBuiltIns(dataset),
    );
  }
}

function baselineResourceCapPerMinute(
  dataset: GameDataset,
  itemId: ItemId,
): number | undefined {
  const resource = dataset.resources[itemId];
  return resource ? defaultResourceCapPerMinute(resource) : undefined;
}
