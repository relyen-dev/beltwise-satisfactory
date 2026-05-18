import { type ItemId, type MachineId, type RecipeId, type ResourceInfo } from '@beltwise/game-data';
import {
  createCustomObjectiveProfile,
  createObjectiveProfileFromPreset,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphDisplaySettings,
  type GraphLayoutState,
  type GraphNodeBuildState,
  normalizePlainTextNote,
  type ObjectivePresetId,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { defaultResourceCapPerMinute, normalizeResourceOverride } from './planner-domain.helpers';

export interface DuplicateProjectOptions {
  id: string;
  now: string;
}

export type ObjectiveWeightKey =
  | 'resourceScarcityWeight'
  | 'powerWeight'
  | 'machineCountWeight'
  | 'surplusWeight';

export function duplicatePlannerProject(
  project: PlannerProject,
  options: DuplicateProjectOptions,
): PlannerProject {
  return {
    ...structuredClone(project),
    id: options.id,
    name: `${project.name} copy`,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

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
  const safeMaxPerMinute = Math.max(0, Number.isFinite(maxPerMinute) ? maxPerMinute : 0);
  const currentOverride = project.resourceOverrides[itemId];
  const nextOverride = normalizeResourceOverride(
    {
      ...(currentOverride?.enabled === false ? { enabled: false } : {}),
      maxPerMinute: safeMaxPerMinute,
    },
    baselineCapPerMinute,
  );

  return {
    ...project,
    resourceOverrides: withOptionalOverride(project.resourceOverrides, itemId, nextOverride),
  };
}

export function setResourceEnabled(
  project: PlannerProject,
  itemId: ItemId,
  enabled: boolean,
  baselineCapPerMinute: number | undefined,
): PlannerProject {
  const currentOverride = project.resourceOverrides[itemId];
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
    ...project,
    resourceOverrides: withOptionalOverride(project.resourceOverrides, itemId, nextOverride),
  };
}

export function resetResource(project: PlannerProject, itemId: ItemId): PlannerProject {
  return {
    ...project,
    resourceOverrides: withoutOverride(project.resourceOverrides, itemId),
  };
}

export function resetResources(
  project: PlannerProject,
  resourceIds: readonly ItemId[],
): PlannerProject {
  let resourceOverrides = project.resourceOverrides;
  for (const itemId of resourceIds) {
    resourceOverrides = withoutOverride(resourceOverrides, itemId);
  }
  return { ...project, resourceOverrides };
}

export function setAllResourcesEnabled(
  project: PlannerProject,
  resources: readonly ResourceInfo[],
  enabled: boolean,
): PlannerProject {
  let resourceOverrides = { ...project.resourceOverrides };
  for (const resource of resources) {
    const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
    const currentOverride = project.resourceOverrides[resource.itemId];
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
  return { ...project, resourceOverrides };
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

export function setGraphNodePosition(
  project: PlannerProject,
  nodeId: string,
  position: { x: number; y: number },
): PlannerProject {
  return setGraphNodePositions(project, { [nodeId]: position });
}

export function setGraphNodePositions(
  project: PlannerProject,
  positions: Readonly<Record<string, { x: number; y: number }>>,
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
    nodePositions[nodeId] = position;
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
    graphLayout: { nodePositions: {} },
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
  const normalizedNote =
    nodeState.note === undefined ? '' : normalizePlainTextNote(nodeState.note);
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

function withOptionalOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
  override: TOverride | undefined,
): Record<string, TOverride> {
  if (override === undefined) {
    return withoutOverride(overrides, id);
  }
  return withOverride(overrides, id, override);
}

function withoutOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
): Record<string, TOverride> {
  const next = { ...overrides };
  delete next[id];
  return next;
}
