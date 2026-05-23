import { type ItemId, type MachineId, type RecipeId, type ResourceInfo } from '@beltwise/game-data';
import {
  createCustomObjectiveProfile,
  createObjectiveProfileFromPreset,
  resetObjectiveProfileRawResourceMultiplier,
  setObjectiveProfileRawResourceMultiplier,
  type ConveyorBeltTier,
  type GraphDisplaySettings,
  type GraphEdgeStyle,
  type GraphLayoutState,
  type GraphNodeBuildState,
  normalizePlainTextNote,
  type ObjectivePresetId,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from './plan';
import {
  defaultResourceCapPerMinute,
  isUnlimitedResourceCap,
  normalizeResourceOverride,
  resourceCapsEqual,
  resetResourceOverride,
  resetResourceOverrides,
  setAllResourceOverridesEnabled,
  setResourceOverrideCap,
  setResourceOverrideEnabled,
} from './resourceOverrideMutations';

export {
  defaultResourceCapPerMinute,
  isUnlimitedResourceCap,
  normalizeResourceOverride,
  resourceCapsEqual,
} from './resourceOverrideMutations';

export type ObjectiveWeightKey =
  | 'resourceScarcityWeight'
  | 'powerWeight'
  | 'machineCountWeight'
  | 'surplusWeight';

export type PlanTargetIntent =
  | { readonly type: 'add-draft-target'; readonly targetId: string }
  | {
      readonly type: 'duplicate-target';
      readonly target: ProductTarget;
      readonly targetId: string;
    }
  | { readonly type: 'remove-target'; readonly targetId: string }
  | { readonly type: 'reorder-targets'; readonly targetIds: readonly string[] }
  | { readonly type: 'set-target-item'; readonly targetId: string; readonly itemId: ItemId }
  | {
      readonly type: 'set-target-mode';
      readonly targetId: string;
      readonly mode: ProductTarget['mode'];
    }
  | {
      readonly type: 'set-target-amount';
      readonly targetId: string;
      readonly amountPerMinute: number;
    };

export type PlanItemInputIntent =
  | {
      readonly type: 'set-item-input';
      readonly itemId: ItemId;
      readonly amountPerMinute: number;
    }
  | {
      readonly type: 'move-item-input';
      readonly previousItemId: ItemId;
      readonly nextItemId: ItemId;
    }
  | { readonly type: 'remove-item-input'; readonly itemId: ItemId };

export type PlanOverrideIntent =
  | { readonly type: 'set-recipe-enabled'; readonly recipeId: RecipeId; readonly enabled: boolean }
  | {
      readonly type: 'set-recipe-group-enabled';
      readonly recipeIds: readonly RecipeId[];
      readonly enabled: boolean;
    }
  | {
      readonly type: 'set-machine-enabled';
      readonly machineId: MachineId;
      readonly enabled: boolean;
    }
  | {
      readonly type: 'set-resource-cap';
      readonly itemId: ItemId;
      readonly maxPerMinute: number;
      readonly baselineCapPerMinute: number | undefined;
    }
  | {
      readonly type: 'set-resource-enabled';
      readonly itemId: ItemId;
      readonly enabled: boolean;
      readonly baselineCapPerMinute: number | undefined;
    }
  | { readonly type: 'reset-resource'; readonly itemId: ItemId }
  | { readonly type: 'reset-resources'; readonly resourceIds: readonly ItemId[] }
  | {
      readonly type: 'set-all-resources-enabled';
      readonly resources: readonly ResourceInfo[];
      readonly enabled: boolean;
    };

export type PlanObjectiveIntent =
  | { readonly type: 'set-objective-preset'; readonly presetId: ObjectivePresetId }
  | {
      readonly type: 'set-objective-weight';
      readonly key: ObjectiveWeightKey;
      readonly value: number;
    }
  | {
      readonly type: 'set-objective-raw-resource-multiplier';
      readonly itemId: ItemId;
      readonly value: number;
    }
  | {
      readonly type: 'reset-objective-raw-resource-multiplier';
      readonly itemId: ItemId;
    };

export type PlanGraphIntent =
  | { readonly type: 'set-node-position'; readonly nodeId: string; readonly position: PointInput }
  | {
      readonly type: 'set-node-positions';
      readonly positions: Readonly<Record<string, PointInput>>;
    }
  | {
      readonly type: 'restore-node-positions';
      readonly positions: Readonly<Record<string, PointInput | null>>;
    }
  | { readonly type: 'reset-layout' }
  | { readonly type: 'set-plan-locked'; readonly locked: boolean }
  | { readonly type: 'set-node-layout-locked'; readonly locked: boolean }
  | { readonly type: 'set-display'; readonly patch: Partial<GraphDisplaySettings> }
  | { readonly type: 'set-node-done'; readonly nodeId: string; readonly done: boolean }
  | { readonly type: 'set-node-note'; readonly nodeId: string; readonly note: string };

export type PlanMetadataIntent = { readonly type: 'set-notes'; readonly notes: string };

type PointInput = { readonly x: number; readonly y: number };

export function updateProjectInList(
  projects: PlannerProject[],
  activeProjectId: string,
  now: string,
  mapper: (project: PlannerProject) => PlannerProject,
): PlannerProject[] {
  return projects.map((project) =>
    project.id === activeProjectId
      ? {
          ...mapper(project),
          updatedAt: now,
        }
      : project,
  );
}

export function mutatePlanTargets(
  project: PlannerProject,
  intent: PlanTargetIntent,
): PlannerProject {
  switch (intent.type) {
    case 'add-draft-target':
      return addDraftTarget(project, intent.targetId);
    case 'duplicate-target':
      return duplicateTarget(project, intent.target, intent.targetId);
    case 'remove-target':
      return removeTarget(project, intent.targetId);
    case 'reorder-targets':
      return reorderTargets(project, intent.targetIds);
    case 'set-target-item':
      return setTargetItem(project, intent.targetId, intent.itemId);
    case 'set-target-mode':
      return setTargetMode(project, intent.targetId, intent.mode);
    case 'set-target-amount':
      return setTargetAmount(project, intent.targetId, intent.amountPerMinute);
  }
}

export function mutatePlanItemInputs(
  project: PlannerProject,
  intent: PlanItemInputIntent,
): PlannerProject {
  switch (intent.type) {
    case 'set-item-input':
      return setItemInput(project, intent.itemId, intent.amountPerMinute);
    case 'move-item-input':
      return moveItemInput(project, intent.previousItemId, intent.nextItemId);
    case 'remove-item-input':
      return removeItemInput(project, intent.itemId);
  }
}

export function mutatePlanOverrides(
  project: PlannerProject,
  intent: PlanOverrideIntent,
): PlannerProject {
  switch (intent.type) {
    case 'set-recipe-enabled':
      return setRecipeEnabled(project, intent.recipeId, intent.enabled);
    case 'set-recipe-group-enabled':
      return setRecipeGroupEnabled(project, intent.recipeIds, intent.enabled);
    case 'set-machine-enabled':
      return setMachineEnabled(project, intent.machineId, intent.enabled);
    case 'set-resource-cap':
      return setResourceCap(
        project,
        intent.itemId,
        intent.maxPerMinute,
        intent.baselineCapPerMinute,
      );
    case 'set-resource-enabled':
      return setResourceEnabled(
        project,
        intent.itemId,
        intent.enabled,
        intent.baselineCapPerMinute,
      );
    case 'reset-resource':
      return resetResource(project, intent.itemId);
    case 'reset-resources':
      return resetResources(project, intent.resourceIds);
    case 'set-all-resources-enabled':
      return setAllResourcesEnabled(project, intent.resources, intent.enabled);
  }
}

export function mutatePlanObjective(
  project: PlannerProject,
  intent: PlanObjectiveIntent,
): PlannerProject {
  switch (intent.type) {
    case 'set-objective-preset':
      return setObjectivePreset(project, intent.presetId);
    case 'set-objective-weight':
      return setObjectiveWeight(project, intent.key, intent.value);
    case 'set-objective-raw-resource-multiplier':
      return setObjectiveRawResourceMultiplier(project, intent.itemId, intent.value);
    case 'reset-objective-raw-resource-multiplier':
      return resetObjectiveRawResourceMultiplier(project, intent.itemId);
  }
}

export function mutatePlanGraph(project: PlannerProject, intent: PlanGraphIntent): PlannerProject {
  switch (intent.type) {
    case 'set-node-position':
      return setGraphNodePositions(project, { [intent.nodeId]: intent.position });
    case 'set-node-positions':
      return setGraphNodePositions(project, intent.positions);
    case 'restore-node-positions':
      return restoreGraphNodePositions(project, intent.positions);
    case 'reset-layout':
      return resetGraphLayout(project);
    case 'set-plan-locked':
      return setPlanLocked(project, intent.locked);
    case 'set-node-layout-locked':
      return setNodeLayoutLocked(project, intent.locked);
    case 'set-display':
      return setGraphDisplay(project, intent.patch);
    case 'set-node-done':
      return setGraphNodeDone(project, intent.nodeId, intent.done);
    case 'set-node-note':
      return setGraphNodeNote(project, intent.nodeId, intent.note);
  }
}

export function mutatePlanMetadata(
  project: PlannerProject,
  intent: PlanMetadataIntent,
): PlannerProject {
  switch (intent.type) {
    case 'set-notes':
      return setPlanNotes(project, intent.notes);
  }
}

export function addDraftTarget(project: PlannerProject, targetId: string): PlannerProject {
  return {
    ...project,
    targets: [
      ...project.targets,
      {
        id: targetId,
        itemId: '',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: project.targets.length,
      },
    ],
  };
}

export function duplicateTarget(
  project: PlannerProject,
  target: ProductTarget,
  targetId: string,
): PlannerProject {
  return {
    ...project,
    targets: [
      ...project.targets,
      {
        ...target,
        id: targetId,
        sortOrder: project.targets.length,
      },
    ],
  };
}

export function removeTarget(project: PlannerProject, targetId: string): PlannerProject {
  return {
    ...project,
    targets: project.targets
      .filter((target) => target.id !== targetId)
      .map((target, index) => ({ ...target, sortOrder: index })),
  };
}

export function reorderTargets(
  project: PlannerProject,
  targetIds: readonly string[],
): PlannerProject {
  const targetById = new Map(project.targets.map((target) => [target.id, target] as const));
  const addedTargetIds = new Set<string>();
  const reorderedTargets: ProductTarget[] = [];

  for (const targetId of targetIds) {
    const target = targetById.get(targetId);
    if (!target || addedTargetIds.has(targetId)) {
      continue;
    }
    addedTargetIds.add(targetId);
    reorderedTargets.push(target);
  }

  for (const target of project.targets.toSorted((left, right) => left.sortOrder - right.sortOrder)) {
    if (!addedTargetIds.has(target.id)) {
      reorderedTargets.push(target);
    }
  }

  return {
    ...project,
    targets: reorderedTargets.map((target, index) => ({ ...target, sortOrder: index })),
  };
}

export function setTargetItem(
  project: PlannerProject,
  targetId: string,
  itemId: ItemId,
): PlannerProject {
  return updateTarget(project, targetId, (target) => ({ ...target, itemId }));
}

export function setTargetMode(
  project: PlannerProject,
  targetId: string,
  mode: ProductTarget['mode'],
): PlannerProject {
  return updateTarget(project, targetId, (target) => {
    if (mode === 'fixed') {
      return { ...target, mode, amountPerMinute: target.amountPerMinute ?? 10 };
    }
    const { amountPerMinute: _amountPerMinute, ...rest } = target;
    return { ...rest, mode };
  });
}

export function setTargetAmount(
  project: PlannerProject,
  targetId: string,
  amountPerMinute: number,
): PlannerProject {
  return updateTarget(project, targetId, (target) => ({
    ...target,
    amountPerMinute: Math.max(0, Number.isFinite(amountPerMinute) ? amountPerMinute : 0),
  }));
}

export function setRecipeEnabled(
  project: PlannerProject,
  recipeId: RecipeId,
  enabled: boolean,
): PlannerProject {
  return {
    ...project,
    recipeOverrides: withOverride(project.recipeOverrides, recipeId, { enabled }),
  };
}

export function setRecipeGroupEnabled(
  project: PlannerProject,
  recipeIds: readonly RecipeId[],
  enabled: boolean,
): PlannerProject {
  const recipeOverrides = { ...project.recipeOverrides };
  for (const recipeId of recipeIds) {
    recipeOverrides[recipeId] = { enabled };
  }
  return { ...project, recipeOverrides };
}

export function setItemInput(
  project: PlannerProject,
  itemId: ItemId,
  amountPerMinute: number,
): PlannerProject {
  return {
    ...project,
    itemInputs: {
      ...project.itemInputs,
      [itemId]: { amountPerMinute: Math.max(0, amountPerMinute) },
    },
  };
}

export function moveItemInput(
  project: PlannerProject,
  previousItemId: ItemId,
  nextItemId: ItemId,
): PlannerProject {
  const previousInput = project.itemInputs[previousItemId];
  if (!previousInput) {
    return project;
  }

  const itemInputs = { ...project.itemInputs };
  delete itemInputs[previousItemId];
  itemInputs[nextItemId] = {
    amountPerMinute: (itemInputs[nextItemId]?.amountPerMinute ?? 0) + previousInput.amountPerMinute,
  };

  return {
    ...project,
    itemInputs,
  };
}

export function removeItemInput(project: PlannerProject, itemId: ItemId): PlannerProject {
  const itemInputs = { ...project.itemInputs };
  delete itemInputs[itemId];
  return {
    ...project,
    itemInputs,
  };
}

export function setResourceCap(
  project: PlannerProject,
  itemId: ItemId,
  maxPerMinute: number,
  baselineCapPerMinute: number | undefined,
): PlannerProject {
  return {
    ...project,
    resourceOverrides: setResourceOverrideCap(
      project.resourceOverrides,
      itemId,
      maxPerMinute,
      baselineCapPerMinute,
    ),
  };
}

export function setResourceEnabled(
  project: PlannerProject,
  itemId: ItemId,
  enabled: boolean,
  baselineCapPerMinute: number | undefined,
): PlannerProject {
  return {
    ...project,
    resourceOverrides: setResourceOverrideEnabled(
      project.resourceOverrides,
      itemId,
      enabled,
      baselineCapPerMinute,
    ),
  };
}

export function resetResource(project: PlannerProject, itemId: ItemId): PlannerProject {
  return {
    ...project,
    resourceOverrides: resetResourceOverride(project.resourceOverrides, itemId),
  };
}

export function resetResources(
  project: PlannerProject,
  resourceIds: readonly ItemId[],
): PlannerProject {
  return {
    ...project,
    resourceOverrides: resetResourceOverrides(project.resourceOverrides, resourceIds),
  };
}

export function setAllResourcesEnabled(
  project: PlannerProject,
  resources: readonly ResourceInfo[],
  enabled: boolean,
): PlannerProject {
  return {
    ...project,
    resourceOverrides: setAllResourceOverridesEnabled(
      project.resourceOverrides,
      resources,
      enabled,
    ),
  };
}

export function setMachineEnabled(
  project: PlannerProject,
  machineId: MachineId,
  enabled: boolean,
): PlannerProject {
  return {
    ...project,
    machineOverrides: withOverride(project.machineOverrides, machineId, { enabled }),
  };
}

export function setObjectivePreset(
  project: PlannerProject,
  presetId: ObjectivePresetId,
): PlannerProject {
  return {
    ...project,
    objectiveProfile:
      presetId === 'custom'
        ? createCustomObjectiveProfile(project.objectiveProfile)
        : createObjectiveProfileFromPreset(presetId, {
            rawResourceMultipliers: project.objectiveProfile.rawResourceMultipliers,
          }),
  };
}

export function setObjectiveWeight(
  project: PlannerProject,
  key: ObjectiveWeightKey,
  value: number,
): PlannerProject {
  return {
    ...project,
    objectiveProfile: createCustomObjectiveProfile(project.objectiveProfile, {
      [key]: value,
    }),
  };
}

export function setObjectiveRawResourceMultiplier(
  project: PlannerProject,
  itemId: ItemId,
  value: number,
): PlannerProject {
  return {
    ...project,
    objectiveProfile: setObjectiveProfileRawResourceMultiplier(
      project.objectiveProfile,
      itemId,
      value,
    ),
  };
}

export function resetObjectiveRawResourceMultiplier(
  project: PlannerProject,
  itemId: ItemId,
): PlannerProject {
  return {
    ...project,
    objectiveProfile: resetObjectiveProfileRawResourceMultiplier(project.objectiveProfile, itemId),
  };
}

export function setGraphNodePosition(
  project: PlannerProject,
  nodeId: string,
  position: PointInput,
): PlannerProject {
  return setGraphNodePositions(project, { [nodeId]: position });
}

export function setGraphNodePositions(
  project: PlannerProject,
  positions: Readonly<Record<string, PointInput>>,
): PlannerProject {
  let changed = false;
  const nodePositions: GraphLayoutState['nodePositions'] = {
    ...project.graphLayout.nodePositions,
  };

  for (const [nodeId, position] of Object.entries(positions)) {
    const current = project.graphLayout.nodePositions[nodeId];
    if (current?.x === position.x && current.y === position.y) {
      continue;
    }
    changed = true;
    nodePositions[nodeId] = { x: position.x, y: position.y };
  }

  if (!changed) {
    return project;
  }

  return {
    ...project,
    graphLayout: {
      ...project.graphLayout,
      nodePositions,
    },
  };
}

export function restoreGraphNodePositions(
  project: PlannerProject,
  positions: Readonly<Record<string, PointInput | null>>,
): PlannerProject {
  let changed = false;
  const nodePositions: GraphLayoutState['nodePositions'] = {
    ...project.graphLayout.nodePositions,
  };

  for (const [nodeId, position] of Object.entries(positions)) {
    if (position === null) {
      if (Object.prototype.hasOwnProperty.call(nodePositions, nodeId)) {
        changed = true;
        delete nodePositions[nodeId];
      }
      continue;
    }

    const current = project.graphLayout.nodePositions[nodeId];
    if (current?.x === position.x && current.y === position.y) {
      continue;
    }
    changed = true;
    nodePositions[nodeId] = { x: position.x, y: position.y };
  }

  if (!changed) {
    return project;
  }

  return {
    ...project,
    graphLayout: {
      ...project.graphLayout,
      nodePositions,
    },
  };
}

export function resetGraphLayout(project: PlannerProject): PlannerProject {
  return {
    ...project,
    graphLayout: defaultGraphLayout(),
  };
}

export function setPlanLocked(project: PlannerProject, locked: boolean): PlannerProject {
  return {
    ...project,
    buildState: {
      ...project.buildState,
      planLocked: locked,
    },
  };
}

export function setNodeLayoutLocked(project: PlannerProject, locked: boolean): PlannerProject {
  return {
    ...project,
    buildState: {
      ...project.buildState,
      nodeLayoutLocked: locked,
    },
  };
}

export function setPlanNotes(project: PlannerProject, notes: string): PlannerProject {
  return {
    ...project,
    notes: normalizePlainTextNote(notes),
  };
}

export function setMaxBeltTier(
  project: PlannerProject,
  maxBeltTier: ConveyorBeltTier,
): PlannerProject {
  return setGraphDisplay(project, { maxBeltTier });
}

export function setMaxPipeTier(project: PlannerProject, maxPipeTier: PipelineTier): PlannerProject {
  return setGraphDisplay(project, { maxPipeTier });
}

export function setRateDecimalPlaces(
  project: PlannerProject,
  rateDecimalPlaces: RateDecimalPlaces,
): PlannerProject {
  return setGraphDisplay(project, { rateDecimalPlaces });
}

export function setGraphEdgeStyle(
  project: PlannerProject,
  edgeStyle: GraphEdgeStyle,
): PlannerProject {
  return setGraphDisplay(project, { edgeStyle });
}

export function setShowTransportLabels(
  project: PlannerProject,
  showTransportLabels: boolean,
): PlannerProject {
  return setGraphDisplay(project, { showTransportLabels });
}

export function setAnimateFlowLines(
  project: PlannerProject,
  animateFlowLines: boolean,
): PlannerProject {
  return setGraphDisplay(project, { animateFlowLines });
}

export function setGraphNodeDone(
  project: PlannerProject,
  nodeId: string,
  done: boolean,
): PlannerProject {
  return updateGraphNodeState(project, nodeId, (nodeState) => {
    const { done: _done, ...rest } = nodeState;
    return done ? { ...rest, done: true } : rest;
  });
}

export function setGraphNodeNote(
  project: PlannerProject,
  nodeId: string,
  note: string,
): PlannerProject {
  return updateGraphNodeState(project, nodeId, (nodeState) => {
    const { note: _note, ...rest } = nodeState;
    const normalizedNote = normalizePlainTextNote(note);
    return normalizedNote.length > 0 ? { ...rest, note: normalizedNote } : rest;
  });
}

export function cleanGraphNodeState(nodeState: GraphNodeBuildState): GraphNodeBuildState | null {
  const done = nodeState.done === true ? true : undefined;
  const normalizedNote = nodeState.note === undefined ? '' : normalizePlainTextNote(nodeState.note);
  const note = normalizedNote.length > 0 ? normalizedNote : undefined;
  if (done === undefined && note === undefined) {
    return null;
  }
  return {
    ...(done !== undefined ? { done } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

export function defaultGraphLayout(): GraphLayoutState {
  return { nodePositions: {} };
}

function updateTarget(
  project: PlannerProject,
  targetId: string,
  mapper: (target: ProductTarget) => ProductTarget,
): PlannerProject {
  return {
    ...project,
    targets: project.targets.map((target) => (target.id === targetId ? mapper(target) : target)),
  };
}

function updateGraphNodeState(
  project: PlannerProject,
  nodeId: string,
  mapper: (nodeState: GraphNodeBuildState) => GraphNodeBuildState,
): PlannerProject {
  const currentNodeState = project.buildState.nodeStates[nodeId] ?? {};
  const nextNodeState = cleanGraphNodeState(mapper(currentNodeState));
  const nodeStates = { ...project.buildState.nodeStates };
  if (nextNodeState === null) {
    delete nodeStates[nodeId];
  } else {
    nodeStates[nodeId] = nextNodeState;
  }

  return {
    ...project,
    buildState: {
      ...project.buildState,
      nodeStates,
    },
  };
}

function setGraphDisplay(
  project: PlannerProject,
  patch: Partial<GraphDisplaySettings>,
): PlannerProject {
  return {
    ...project,
    graphDisplay: {
      ...project.graphDisplay,
      ...patch,
    },
  };
}

function withOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
  override: TOverride,
): Record<string, TOverride> {
  return {
    ...overrides,
    [id]: override,
  };
}
