import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  defaultResourceCapPerMinute,
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type PlannerUserDefaults,
  type RateDecimalPlaces,
  resetAllDefaultResources,
  resetDefaultResource,
  resetDefaultObjectiveRawResourceMultiplier,
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
  setDefaultObjectiveRawResourceMultiplier,
  setDefaultObjectiveWeight,
  setDefaultRateDecimalPlaces,
  setDefaultRecipeEnabled,
  setDefaultRecipesEnabled,
  setDefaultResourceCap,
  setDefaultResourceEnabled,
  setDefaultShowTransportLabels,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import {
  selectMachineRows,
  selectRawResourceMultiplierRows,
  selectRecipeRows,
  selectResourceRows,
} from './planner-store.selectors';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

export interface PlannerDefaultsStorePort {
  readonly dataset: Signal<GameDataset | null>;
  readonly userDefaults: Signal<PlannerUserDefaults | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly updateUserDefaults: (
    mapper: (userDefaults: PlannerUserDefaults, dataset: GameDataset) => PlannerUserDefaults,
  ) => void;
}

export interface PlannerDefaultsRecipeCommands {
  readonly setEnabled: (recipeId: RecipeId, enabled: boolean) => void;
  readonly setManyEnabled: (recipeIds: readonly RecipeId[], enabled: boolean) => void;
}

export interface PlannerDefaultsMachineCommands {
  readonly setEnabled: (machineId: MachineId, enabled: boolean) => void;
  readonly setManyEnabled: (machineIds: readonly MachineId[], enabled: boolean) => void;
}

export interface PlannerDefaultsResourceCommands {
  readonly setCap: (itemId: ItemId, maxPerMinute: number) => void;
  readonly setEnabled: (itemId: ItemId, enabled: boolean) => void;
  readonly reset: (itemId: ItemId) => void;
  readonly resetAll: () => void;
  readonly setAllEnabled: (enabled: boolean) => void;
}

export interface PlannerDefaultsObjectiveCommands {
  readonly setPreset: (presetId: ObjectivePresetId) => void;
  readonly setWeight: (key: ObjectiveWeightKey, value: number) => void;
  readonly setRawResourceMultiplier: (itemId: ItemId, value: number) => void;
  readonly resetRawResourceMultiplier: (itemId: ItemId) => void;
}

export interface PlannerDefaultsDisplayCommands {
  readonly setMaxBeltTier: (maxBeltTier: ConveyorBeltTier) => void;
  readonly setMaxPipeTier: (maxPipeTier: PipelineTier) => void;
  readonly setRateDecimalPlaces: (rateDecimalPlaces: RateDecimalPlaces) => void;
  readonly setGraphEdgeStyle: (edgeStyle: GraphEdgeStyle) => void;
  readonly setShowTransportLabels: (showTransportLabels: boolean) => void;
  readonly setAnimateFlowLines: (animateFlowLines: boolean) => void;
}

export interface PlannerDefaultsReadModel {
  readonly userDefaults: Signal<PlannerUserDefaults | null>;
  readonly recipeSearch: WritableSignal<string>;
  readonly resourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  readonly rawResourceMultiplierRows: Signal<ReturnType<typeof selectRawResourceMultiplierRows>>;
  readonly machineRows: Signal<ReturnType<typeof selectMachineRows>>;
  readonly recipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly baseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly standardBaseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly converterResourceRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly alternateRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly objectiveProfile: Signal<ObjectiveProfile | null>;
  readonly graphDisplaySettings: Signal<PlannerUserDefaults['graphDisplay'] | null>;
}

export interface PlannerDefaultsCommands {
  readonly recipeCommands: PlannerDefaultsRecipeCommands;
  readonly machineCommands: PlannerDefaultsMachineCommands;
  readonly resourceCommands: PlannerDefaultsResourceCommands;
  readonly objectiveCommands: PlannerDefaultsObjectiveCommands;
  readonly displayCommands: PlannerDefaultsDisplayCommands;
  readonly saveActivePlanAsDefaults: () => void;
  readonly resetUserDefaults: () => void;
}

export const PLANNER_DEFAULTS_STORE_PORT = new InjectionToken<PlannerDefaultsStorePort>(
  'PLANNER_DEFAULTS_STORE_PORT',
  {
    providedIn: 'root',
    factory: createPlannerDefaultsStorePort,
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerDefaultsStore implements PlannerDefaultsReadModel, PlannerDefaultsCommands {
  private readonly port = inject(PLANNER_DEFAULTS_STORE_PORT);

  public readonly userDefaults = this.port.userDefaults;
  public readonly recipeSearch = signal('');

  public readonly objectiveProfile = computed(
    () => this.port.userDefaults()?.objectiveProfile ?? null,
  );

  public readonly graphDisplaySettings = computed(
    () => this.port.userDefaults()?.graphDisplay ?? null,
  );

  public readonly resourceRows = computed(() => {
    const dataset = this.port.dataset();
    const userDefaults = this.port.userDefaults();
    return dataset && userDefaults ? selectResourceRows(dataset, userDefaults) : [];
  });

  public readonly rawResourceMultiplierRows = computed(() => {
    const dataset = this.port.dataset();
    const userDefaults = this.port.userDefaults();
    return dataset && userDefaults
      ? selectRawResourceMultiplierRows(dataset, userDefaults.objectiveProfile)
      : [];
  });

  public readonly machineRows = computed(() => {
    const dataset = this.port.dataset();
    const userDefaults = this.port.userDefaults();
    return dataset && userDefaults ? selectMachineRows(dataset, userDefaults) : [];
  });

  public readonly recipeRows = computed(() => {
    const dataset = this.port.dataset();
    const userDefaults = this.port.userDefaults();
    return dataset && userDefaults
      ? selectRecipeRows(dataset, userDefaults, this.recipeSearch())
      : [];
  });

  public readonly baseRecipeRows = computed(() =>
    this.recipeRows().filter((row) => !row.recipe.isAlternate),
  );

  public readonly standardBaseRecipeRows = computed(() =>
    this.baseRecipeRows().filter((row) => !row.isConverterResourceRecipe),
  );

  public readonly converterResourceRecipeRows = computed(() =>
    this.baseRecipeRows().filter((row) => row.isConverterResourceRecipe),
  );

  public readonly alternateRecipeRows = computed(() =>
    this.recipeRows().filter((row) => row.recipe.isAlternate),
  );

  public readonly recipeCommands: PlannerDefaultsRecipeCommands = {
    setEnabled: (recipeId, enabled) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultRecipeEnabled(userDefaults, recipeId, enabled),
      ),
    setManyEnabled: (recipeIds, enabled) => {
      if (recipeIds.length === 0) {
        return;
      }
      this.updateUserDefaults((userDefaults) =>
        setDefaultRecipesEnabled(userDefaults, recipeIds, enabled),
      );
    },
  };

  public readonly machineCommands: PlannerDefaultsMachineCommands = {
    setEnabled: (machineId, enabled) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultMachineEnabled(userDefaults, machineId, enabled),
      ),
    setManyEnabled: (machineIds, enabled) => {
      if (machineIds.length === 0) {
        return;
      }
      this.updateUserDefaults((userDefaults) =>
        setDefaultMachinesEnabled(userDefaults, machineIds, enabled),
      );
    },
  };

  public readonly resourceCommands: PlannerDefaultsResourceCommands = {
    setCap: (itemId, maxPerMinute) =>
      this.updateUserDefaults((userDefaults, dataset) =>
        setDefaultResourceCap(
          userDefaults,
          itemId,
          maxPerMinute,
          baselineResourceCapPerMinute(dataset, itemId),
        ),
      ),
    setEnabled: (itemId, enabled) =>
      this.updateUserDefaults((userDefaults, dataset) =>
        setDefaultResourceEnabled(
          userDefaults,
          itemId,
          enabled,
          baselineResourceCapPerMinute(dataset, itemId),
        ),
      ),
    reset: (itemId) =>
      this.updateUserDefaults((userDefaults) => resetDefaultResource(userDefaults, itemId)),
    resetAll: () =>
      this.updateUserDefaults((userDefaults, dataset) =>
        resetAllDefaultResources(userDefaults, Object.keys(dataset.resources)),
      ),
    setAllEnabled: (enabled) =>
      this.updateUserDefaults((userDefaults, dataset) =>
        setAllDefaultResourcesEnabled(userDefaults, Object.values(dataset.resources), enabled),
      ),
  };

  public readonly objectiveCommands: PlannerDefaultsObjectiveCommands = {
    setPreset: (presetId) =>
      this.updateUserDefaults((userDefaults) => setDefaultObjectivePreset(userDefaults, presetId)),
    setWeight: (key, value) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultObjectiveWeight(userDefaults, key, value),
      ),
    setRawResourceMultiplier: (itemId, value) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultObjectiveRawResourceMultiplier(userDefaults, itemId, value),
      ),
    resetRawResourceMultiplier: (itemId) =>
      this.updateUserDefaults((userDefaults) =>
        resetDefaultObjectiveRawResourceMultiplier(userDefaults, itemId),
      ),
  };

  public readonly displayCommands: PlannerDefaultsDisplayCommands = {
    setMaxBeltTier: (maxBeltTier) =>
      this.updateUserDefaults((userDefaults) => setDefaultMaxBeltTier(userDefaults, maxBeltTier)),
    setMaxPipeTier: (maxPipeTier) =>
      this.updateUserDefaults((userDefaults) => setDefaultMaxPipeTier(userDefaults, maxPipeTier)),
    setRateDecimalPlaces: (rateDecimalPlaces) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultRateDecimalPlaces(userDefaults, rateDecimalPlaces),
      ),
    setGraphEdgeStyle: (edgeStyle) =>
      this.updateUserDefaults((userDefaults) => setDefaultGraphEdgeStyle(userDefaults, edgeStyle)),
    setShowTransportLabels: (showTransportLabels) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultShowTransportLabels(userDefaults, showTransportLabels),
      ),
    setAnimateFlowLines: (animateFlowLines) =>
      this.updateUserDefaults((userDefaults) =>
        setDefaultAnimateFlowLines(userDefaults, animateFlowLines),
      ),
  };

  public saveActivePlanAsDefaults(): void {
    const project = this.port.activeProject();
    if (!project) {
      return;
    }
    this.updateUserDefaults(() => saveProjectSettingsAsDefaults(project));
  }

  public resetUserDefaults(): void {
    this.updateUserDefaults((_userDefaults, dataset) => resetUserDefaultsToBuiltIns(dataset));
  }

  private updateUserDefaults(
    mapper: (userDefaults: PlannerUserDefaults, dataset: GameDataset) => PlannerUserDefaults,
  ): void {
    this.port.updateUserDefaults(mapper);
  }
}

function createPlannerDefaultsStorePort(): PlannerDefaultsStorePort {
  const datasetService = inject(DatasetService);
  const workspace = inject(PlannerWorkspaceSlice);

  return {
    dataset: datasetService.dataset,
    userDefaults: workspace.userDefaults,
    activeProject: workspace.activeProject,
    updateUserDefaults: (mapper) => workspace.updateUserDefaults(mapper),
  };
}

function baselineResourceCapPerMinute(dataset: GameDataset, itemId: ItemId): number | undefined {
  const resource = dataset.resources[itemId];
  return resource ? defaultResourceCapPerMinute(resource) : undefined;
}
