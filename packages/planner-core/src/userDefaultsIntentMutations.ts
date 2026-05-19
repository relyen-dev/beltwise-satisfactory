import {
  type GameDataset,
  type ItemId,
  type MachineId,
  type RecipeId,
  type ResourceInfo,
} from '@beltwise/game-data';
import {
  createCustomObjectiveProfile,
  createDefaultUserDefaults,
  createObjectiveProfileFromPreset,
  createUserDefaultsFromProject,
  resetObjectiveProfileRawResourceMultiplier,
  setObjectiveProfileRawResourceMultiplier,
  type ConveyorBeltTier,
  type GraphDisplaySettings,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type PipelineTier,
  type PlannerProject,
  type PlannerUserDefaults,
  type RateDecimalPlaces,
} from './plan';
import type { ObjectiveWeightKey } from './planIntentMutations';
import {
  resetResourceOverride,
  resetResourceOverrides,
  setAllResourceOverridesEnabled,
  setResourceOverrideCap,
  setResourceOverrideEnabled,
} from './resourceOverrideMutations';

export function setDefaultRecipeEnabled(
  userDefaults: PlannerUserDefaults,
  recipeId: RecipeId,
  enabled: boolean,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    recipeOverrides: {
      ...userDefaults.recipeOverrides,
      [recipeId]: { enabled },
    },
  };
}

export function setDefaultRecipesEnabled(
  userDefaults: PlannerUserDefaults,
  recipeIds: readonly RecipeId[],
  enabled: boolean,
): PlannerUserDefaults {
  const recipeOverrides = { ...userDefaults.recipeOverrides };
  for (const recipeId of recipeIds) {
    recipeOverrides[recipeId] = { enabled };
  }
  return { ...userDefaults, recipeOverrides };
}

export function setDefaultMachineEnabled(
  userDefaults: PlannerUserDefaults,
  machineId: MachineId,
  enabled: boolean,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    machineOverrides: {
      ...userDefaults.machineOverrides,
      [machineId]: { enabled },
    },
  };
}

export function setDefaultMachinesEnabled(
  userDefaults: PlannerUserDefaults,
  machineIds: readonly MachineId[],
  enabled: boolean,
): PlannerUserDefaults {
  const machineOverrides = { ...userDefaults.machineOverrides };
  for (const machineId of machineIds) {
    machineOverrides[machineId] = { enabled };
  }
  return { ...userDefaults, machineOverrides };
}

export function setDefaultResourceCap(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
  maxPerMinute: number,
  baselineCapPerMinute: number | undefined,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: setResourceOverrideCap(
      userDefaults.resourceOverrides,
      itemId,
      maxPerMinute,
      baselineCapPerMinute,
    ),
  };
}

export function setDefaultResourceEnabled(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
  enabled: boolean,
  baselineCapPerMinute: number | undefined,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: setResourceOverrideEnabled(
      userDefaults.resourceOverrides,
      itemId,
      enabled,
      baselineCapPerMinute,
    ),
  };
}

export function resetDefaultResource(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: resetResourceOverride(userDefaults.resourceOverrides, itemId),
  };
}

export function resetAllDefaultResources(
  userDefaults: PlannerUserDefaults,
  resourceIds: readonly ItemId[],
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: resetResourceOverrides(userDefaults.resourceOverrides, resourceIds),
  };
}

export function setAllDefaultResourcesEnabled(
  userDefaults: PlannerUserDefaults,
  resources: readonly ResourceInfo[],
  enabled: boolean,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: setAllResourceOverridesEnabled(
      userDefaults.resourceOverrides,
      resources,
      enabled,
    ),
  };
}

export function setDefaultObjectivePreset(
  userDefaults: PlannerUserDefaults,
  presetId: ObjectivePresetId,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    objectiveProfile:
      presetId === 'custom'
        ? createCustomObjectiveProfile(userDefaults.objectiveProfile)
        : createObjectiveProfileFromPreset(presetId, {
            rawResourceMultipliers: userDefaults.objectiveProfile.rawResourceMultipliers,
          }),
  };
}

export function setDefaultObjectiveWeight(
  userDefaults: PlannerUserDefaults,
  key: ObjectiveWeightKey,
  value: number,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    objectiveProfile: createCustomObjectiveProfile(userDefaults.objectiveProfile, {
      [key]: value,
    }),
  };
}

export function setDefaultObjectiveRawResourceMultiplier(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
  value: number,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    objectiveProfile: setObjectiveProfileRawResourceMultiplier(
      userDefaults.objectiveProfile,
      itemId,
      value,
    ),
  };
}

export function resetDefaultObjectiveRawResourceMultiplier(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    objectiveProfile: resetObjectiveProfileRawResourceMultiplier(
      userDefaults.objectiveProfile,
      itemId,
    ),
  };
}

export function setDefaultMaxBeltTier(
  userDefaults: PlannerUserDefaults,
  maxBeltTier: ConveyorBeltTier,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { maxBeltTier });
}

export function setDefaultMaxPipeTier(
  userDefaults: PlannerUserDefaults,
  maxPipeTier: PipelineTier,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { maxPipeTier });
}

export function setDefaultRateDecimalPlaces(
  userDefaults: PlannerUserDefaults,
  rateDecimalPlaces: RateDecimalPlaces,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { rateDecimalPlaces });
}

export function setDefaultGraphEdgeStyle(
  userDefaults: PlannerUserDefaults,
  edgeStyle: GraphEdgeStyle,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { edgeStyle });
}

export function setDefaultShowTransportLabels(
  userDefaults: PlannerUserDefaults,
  showTransportLabels: boolean,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { showTransportLabels });
}

export function setDefaultAnimateFlowLines(
  userDefaults: PlannerUserDefaults,
  animateFlowLines: boolean,
): PlannerUserDefaults {
  return setDefaultGraphDisplay(userDefaults, { animateFlowLines });
}

export function saveProjectSettingsAsDefaults(project: PlannerProject): PlannerUserDefaults {
  return createUserDefaultsFromProject(project);
}

export function resetUserDefaultsToBuiltIns(dataset: GameDataset): PlannerUserDefaults {
  return createDefaultUserDefaults(dataset);
}

function setDefaultGraphDisplay(
  userDefaults: PlannerUserDefaults,
  patch: Partial<GraphDisplaySettings>,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    graphDisplay: {
      ...userDefaults.graphDisplay,
      ...patch,
    },
  };
}
