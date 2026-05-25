import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import {
  createDefaultGraphDisplaySettings,
  createDefaultObjectiveProfile,
  createDefaultRecipeOverrides,
  createPlannerProject,
  type GraphDisplaySettings,
  type GraphLayoutState,
  type ObjectiveProfile,
  type PlanBuildState,
  type PlannerProject,
  type PlannerUserDefaults,
  type PowerTarget,
  type ProductTarget,
  type RecipeOverride,
  type MachineOverride,
  type ResourceOverride,
  type ItemInputOverride,
  type SinkRule,
} from '../plan';
import {
  type AmountOverrideEntry,
  type BooleanOverrideEntry,
  type GraphNodePositionEntry,
  type ResourceOverrideEntry,
  amountOverrideEntriesForTransfer,
  booleanOverrideEntriesForTransfer,
  copyBooleanOverridesForTransfer,
  copyGraphDisplaySettingsForTransfer,
  copyGraphLayoutNodePositionsForTransfer,
  copyItemInputsForTransfer,
  copyNumberRecordForTransfer,
  copyPlanBuildStateForTransfer,
  copyPowerTargetsForTransfer,
  copyProductTargetForTransfer,
  copyResourceOverridesForTransfer,
  copySinkRulesForTransfer,
  graphNodePositionEntriesForTransfer,
  objectiveStageOrdersEqual,
  resourceOverrideEntriesForTransfer,
} from '../planTransferFieldCodecs';

export interface PlannerProjectIntentSnapshot {
  notes: string;
  targets: ProductTarget[];
  powerTargets: PowerTarget[];
  sinkRules: SinkRule[];
  recipeOverrides: Record<RecipeId, RecipeOverride>;
  machineOverrides: Record<MachineId, MachineOverride>;
  resourceOverrides: Record<ItemId, ResourceOverride>;
  itemInputs: Record<ItemId, ItemInputOverride>;
  objectiveProfile: ObjectiveProfile;
  graphLayout: GraphLayoutState;
  graphDisplay: GraphDisplaySettings;
  buildState: PlanBuildState;
}

export interface PlannerProjectIntentOverlay {
  notes?: string;
  targets?: ProductTarget[];
  powerTargets?: PowerTarget[];
  sinkRules?: SinkRule[];
  recipeOverrides?: Record<RecipeId, RecipeOverride>;
  machineOverrides?: Record<MachineId, MachineOverride>;
  resourceOverrides?: Record<ItemId, ResourceOverride>;
  itemInputs?: Record<ItemId, ItemInputOverride>;
  objectiveProfile?: ObjectiveProfile;
  graphLayout?: GraphLayoutState;
  graphDisplay?: GraphDisplaySettings;
  buildState?: PlanBuildState;
}

export interface CanonicalPlannerProjectOptions {
  id: string;
  name: string;
  dataset: GameDataset;
  now: string;
}

export function copyPlannerProjectIntentSnapshot(
  project: PlannerProject,
): PlannerProjectIntentSnapshot {
  return {
    notes: project.notes,
    targets: project.targets.map(copyProductTargetForTransfer),
    powerTargets: copyPowerTargetsForTransfer(project.powerTargets),
    sinkRules: copySinkRulesForTransfer(project.sinkRules),
    recipeOverrides: copyBooleanOverridesForTransfer(project.recipeOverrides),
    machineOverrides: copyBooleanOverridesForTransfer(project.machineOverrides),
    resourceOverrides: copyResourceOverridesForTransfer(project.resourceOverrides),
    itemInputs: copyItemInputsForTransfer(project.itemInputs),
    objectiveProfile: copyObjectiveProfileForIntent(project.objectiveProfile),
    graphLayout: {
      nodePositions: copyGraphLayoutNodePositionsForTransfer(project.graphLayout.nodePositions),
    },
    graphDisplay: copyGraphDisplaySettingsForTransfer(project.graphDisplay),
    buildState: copyPlanBuildStateForTransfer(project.buildState),
  };
}

export function copyPlannerUserDefaultsIntentSnapshot(
  userDefaults: PlannerUserDefaults,
): PlannerUserDefaults {
  return {
    recipeOverrides: copyBooleanOverridesForTransfer(userDefaults.recipeOverrides),
    machineOverrides: copyBooleanOverridesForTransfer(userDefaults.machineOverrides),
    resourceOverrides: copyResourceOverridesForTransfer(userDefaults.resourceOverrides),
    objectiveProfile: copyObjectiveProfileForIntent(userDefaults.objectiveProfile),
    graphDisplay: copyGraphDisplaySettingsForTransfer(userDefaults.graphDisplay),
  };
}

export function applyPlannerProjectIntentToCanonicalDefaults(
  overlay: PlannerProjectIntentOverlay,
  options: CanonicalPlannerProjectOptions,
): PlannerProject {
  const defaults = createPlannerProject({
    id: options.id,
    name: options.name,
    dataset: options.dataset,
    now: options.now,
  });

  return {
    ...defaults,
    notes: overlay.notes ?? defaults.notes,
    targets: overlay.targets?.map(copyProductTargetForTransfer) ?? defaults.targets,
    powerTargets:
      overlay.powerTargets === undefined
        ? defaults.powerTargets
        : copyPowerTargetsForTransfer(overlay.powerTargets),
    sinkRules:
      overlay.sinkRules === undefined
        ? defaults.sinkRules
        : copySinkRulesForTransfer(overlay.sinkRules),
    recipeOverrides:
      overlay.recipeOverrides === undefined
        ? defaults.recipeOverrides
        : {
            ...defaults.recipeOverrides,
            ...copyBooleanOverridesForTransfer(overlay.recipeOverrides),
          },
    machineOverrides:
      overlay.machineOverrides === undefined
        ? defaults.machineOverrides
        : copyBooleanOverridesForTransfer(overlay.machineOverrides),
    resourceOverrides:
      overlay.resourceOverrides === undefined
        ? defaults.resourceOverrides
        : copyResourceOverridesForTransfer(overlay.resourceOverrides),
    itemInputs:
      overlay.itemInputs === undefined
        ? defaults.itemInputs
        : copyItemInputsForTransfer(overlay.itemInputs),
    objectiveProfile:
      overlay.objectiveProfile === undefined
        ? defaults.objectiveProfile
        : copyObjectiveProfileForIntent(overlay.objectiveProfile),
    graphLayout:
      overlay.graphLayout === undefined
        ? defaults.graphLayout
        : {
            nodePositions: copyGraphLayoutNodePositionsForTransfer(
              overlay.graphLayout.nodePositions,
            ),
          },
    graphDisplay:
      overlay.graphDisplay === undefined
        ? defaults.graphDisplay
        : copyGraphDisplaySettingsForTransfer(overlay.graphDisplay),
    buildState:
      overlay.buildState === undefined
        ? defaults.buildState
        : copyPlanBuildStateForTransfer(overlay.buildState),
  };
}

export function canonicalRecipeOverrideEntries(
  project: PlannerProject,
  dataset: GameDataset,
): BooleanOverrideEntry<RecipeId>[] {
  return booleanOverrideEntriesForTransfer(
    project.recipeOverrides,
    createDefaultRecipeOverrides(dataset),
    true,
  );
}

export function canonicalMachineOverrideEntries(
  project: PlannerProject,
): BooleanOverrideEntry<MachineId>[] {
  return booleanOverrideEntriesForTransfer(project.machineOverrides, {}, true);
}

export function canonicalResourceOverrideEntries(
  project: PlannerProject,
): ResourceOverrideEntry[] {
  return resourceOverrideEntriesForTransfer(project.resourceOverrides, {
    omitEnabledWhenTrue: true,
  });
}

export function canonicalItemInputEntries(project: PlannerProject): AmountOverrideEntry[] {
  return amountOverrideEntriesForTransfer(project.itemInputs);
}

export function canonicalRawResourceMultiplierEntries(
  profile: ObjectiveProfile,
): AmountOverrideEntry[] {
  return Object.entries(profile.rawResourceMultipliers).map(([id, amountPerMinute]) => ({
    id,
    amountPerMinute,
  }));
}

export function canonicalGraphNodePositionEntries(
  project: PlannerProject,
): GraphNodePositionEntry[] {
  return graphNodePositionEntriesForTransfer(project.graphLayout.nodePositions);
}

export function objectiveProfileDiffersFromCanonicalDefault(profile: ObjectiveProfile): boolean {
  const defaults = createDefaultObjectiveProfile();
  return (
    profile.presetId !== defaults.presetId ||
    profile.strategy !== defaults.strategy ||
    !objectiveStageOrdersEqual(profile.stageOrder, defaults.stageOrder) ||
    profile.resourceScarcityWeight !== defaults.resourceScarcityWeight ||
    profile.powerWeight !== defaults.powerWeight ||
    profile.machineCountWeight !== defaults.machineCountWeight ||
    profile.surplusWeight !== defaults.surplusWeight ||
    Object.keys(profile.rawResourceMultipliers).length > 0
  );
}

export function graphDisplayDiffersFromCanonicalDefault(settings: GraphDisplaySettings): boolean {
  const defaults = createDefaultGraphDisplaySettings();
  return (
    settings.maxBeltTier !== defaults.maxBeltTier ||
    settings.maxPipeTier !== defaults.maxPipeTier ||
    settings.rateDecimalPlaces !== defaults.rateDecimalPlaces ||
    settings.edgeStyle !== defaults.edgeStyle ||
    settings.showTransportLabels !== defaults.showTransportLabels ||
    settings.animateFlowLines !== defaults.animateFlowLines
  );
}

function copyObjectiveProfileForIntent(profile: ObjectiveProfile): ObjectiveProfile {
  return {
    presetId: profile.presetId,
    strategy: profile.strategy,
    stageOrder: [...profile.stageOrder],
    resourceScarcityWeight: profile.resourceScarcityWeight,
    powerWeight: profile.powerWeight,
    machineCountWeight: profile.machineCountWeight,
    surplusWeight: profile.surplusWeight,
    rawResourceMultipliers: copyNumberRecordForTransfer(profile.rawResourceMultipliers),
  };
}
