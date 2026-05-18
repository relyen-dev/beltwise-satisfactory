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
  defaultResourceCapPerMinute,
  type ConveyorBeltTier,
  type GraphDisplaySettings,
  type GraphEdgeStyle,
  normalizeResourceOverride,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type PlannerUserDefaults,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';

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
  const safeMaxPerMinute = Math.max(0, Number.isFinite(maxPerMinute) ? maxPerMinute : 0);
  const currentOverride = userDefaults.resourceOverrides[itemId];
  const nextOverride = normalizeResourceOverride(
    {
      ...(currentOverride?.enabled === false ? { enabled: false } : {}),
      maxPerMinute: safeMaxPerMinute,
    },
    baselineCapPerMinute,
  );

  return {
    ...userDefaults,
    resourceOverrides: withOptionalOverride(userDefaults.resourceOverrides, itemId, nextOverride),
  };
}

export function setDefaultResourceEnabled(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
  enabled: boolean,
  baselineCapPerMinute: number | undefined,
): PlannerUserDefaults {
  const currentOverride = userDefaults.resourceOverrides[itemId];
  const currentCapPerMinute = currentOverride?.maxPerMinute ?? baselineCapPerMinute;
  const nextOverride = enabled
    ? normalizeResourceOverride(
        {
          ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
        },
        baselineCapPerMinute,
      )
    : {
        enabled: false,
        ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
      };

  return {
    ...userDefaults,
    resourceOverrides: withOptionalOverride(userDefaults.resourceOverrides, itemId, nextOverride),
  };
}

export function resetDefaultResource(
  userDefaults: PlannerUserDefaults,
  itemId: ItemId,
): PlannerUserDefaults {
  return {
    ...userDefaults,
    resourceOverrides: withoutOverride(userDefaults.resourceOverrides, itemId),
  };
}

export function resetAllDefaultResources(
  userDefaults: PlannerUserDefaults,
  resourceIds: readonly ItemId[],
): PlannerUserDefaults {
  let resourceOverrides = userDefaults.resourceOverrides;
  for (const itemId of resourceIds) {
    resourceOverrides = withoutOverride(resourceOverrides, itemId);
  }
  return { ...userDefaults, resourceOverrides };
}

export function setAllDefaultResourcesEnabled(
  userDefaults: PlannerUserDefaults,
  resources: readonly ResourceInfo[],
  enabled: boolean,
): PlannerUserDefaults {
  let resourceOverrides = { ...userDefaults.resourceOverrides };
  for (const resource of resources) {
    const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
    const currentOverride = userDefaults.resourceOverrides[resource.itemId];
    const currentCapPerMinute = currentOverride?.maxPerMinute ?? baselineCapPerMinute;
    const nextOverride = enabled
      ? normalizeResourceOverride(
          {
            ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
          },
          baselineCapPerMinute,
        )
      : {
          enabled: false,
          ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
        };
    resourceOverrides = withOptionalOverride(resourceOverrides, resource.itemId, nextOverride);
  }
  return { ...userDefaults, resourceOverrides };
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

function withOptionalOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
  override: TOverride | undefined,
): Record<string, TOverride> {
  if (override === undefined) {
    return withoutOverride(overrides, id);
  }
  return {
    ...overrides,
    [id]: override,
  };
}

function withoutOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
): Record<string, TOverride> {
  const next = { ...overrides };
  delete next[id];
  return next;
}
