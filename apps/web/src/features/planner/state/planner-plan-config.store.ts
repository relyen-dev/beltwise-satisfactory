import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import {
  type GameDataset,
  type Item,
  type ItemId,
  type MachineId,
  type RecipeId,
} from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type ObjectiveProfile,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type ProductionPlanResult,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { PlannerPlanCommandSlice } from './planner-store-plan-commands';
import {
  selectExternalInputRows,
  selectItemOptions,
  selectMachinePanelSummary,
  selectMachineRows,
  selectRawResourceMultiplierRows,
  selectRecipeRows,
  selectResourceRows,
} from './planner-store.selectors';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

export interface PlannerPlanConfigStorePort {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
  readonly updateActiveProject: (mapper: (project: PlannerProject) => PlannerProject) => void;
}

export interface PlannerPlanTargetCommands {
  readonly add: () => void;
  readonly duplicate: (target: ProductTarget) => void;
  readonly remove: (targetId: string) => void;
  readonly updateItem: (targetId: string, itemId: ItemId) => void;
  readonly updateMode: (targetId: string, mode: ProductTarget['mode']) => void;
  readonly updateAmount: (targetId: string, amountPerMinute: number) => void;
}

export interface PlannerPlanInputCommands {
  readonly addFirstAvailable: () => void;
  readonly set: (itemId: ItemId, amountPerMinute: number) => void;
  readonly move: (previousItemId: ItemId, nextItemId: ItemId) => void;
  readonly remove: (itemId: ItemId) => void;
}

export interface PlannerPlanResourceCommands {
  readonly setCap: (itemId: ItemId, maxPerMinute: number) => void;
  readonly setEnabled: (itemId: ItemId, enabled: boolean) => void;
  readonly reset: (itemId: ItemId) => void;
  readonly resetAll: () => void;
  readonly setAllEnabled: (enabled: boolean) => void;
}

export interface PlannerPlanRecipeCommands {
  readonly setEnabled: (recipeId: RecipeId, enabled: boolean) => void;
  readonly setManyEnabled: (recipeIds: readonly RecipeId[], enabled: boolean) => void;
  readonly setGroupEnabled: (isAlternate: boolean, enabled: boolean) => void;
}

export interface PlannerPlanMachineCommands {
  readonly setEnabled: (machineId: MachineId, enabled: boolean) => void;
}

export interface PlannerPlanObjectiveCommands {
  readonly setPreset: (presetId: ObjectivePresetId) => void;
  readonly setWeight: (key: ObjectiveWeightKey, value: number) => void;
  readonly setRawResourceMultiplier: (itemId: ItemId, value: number) => void;
  readonly resetRawResourceMultiplier: (itemId: ItemId) => void;
}

export interface PlannerPlanDisplayCommands {
  readonly setMaxBeltTier: (maxBeltTier: ConveyorBeltTier) => void;
  readonly setMaxPipeTier: (maxPipeTier: PipelineTier) => void;
  readonly setRateDecimalPlaces: (rateDecimalPlaces: RateDecimalPlaces) => void;
  readonly setGraphEdgeStyle: (edgeStyle: GraphEdgeStyle) => void;
  readonly setShowTransportLabels: (showTransportLabels: boolean) => void;
  readonly setAnimateFlowLines: (animateFlowLines: boolean) => void;
}

export interface PlannerPlanNoteCommands {
  readonly set: (notes: string) => void;
  readonly clear: () => void;
}

export interface PlannerPlanConfigReadModel {
  readonly activePlanId: Signal<string | null>;
  readonly hasActivePlan: Signal<boolean>;
  readonly editingLocked: Signal<boolean>;
  readonly targetRows: Signal<readonly ProductTarget[]>;
  readonly planNotes: Signal<string>;
  readonly itemOptions: Signal<readonly Item[]>;
  readonly externalInputRows: Signal<ReturnType<typeof selectExternalInputRows>>;
  readonly resourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  readonly recipeSearch: WritableSignal<string>;
  readonly recipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly baseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly standardBaseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly converterResourceRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly alternateRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  readonly machineRows: Signal<ReturnType<typeof selectMachineRows>>;
  readonly machinePanelSummary: Signal<ReturnType<typeof selectMachinePanelSummary>>;
  readonly objectiveProfile: Signal<ObjectiveProfile | null>;
  readonly rawResourceMultiplierRows: Signal<ReturnType<typeof selectRawResourceMultiplierRows>>;
  readonly graphDisplaySettings: Signal<PlannerProject['graphDisplay'] | null>;
}

export interface PlannerPlanConfigCommands {
  readonly targetCommands: PlannerPlanTargetCommands;
  readonly inputCommands: PlannerPlanInputCommands;
  readonly resourceCommands: PlannerPlanResourceCommands;
  readonly recipeCommands: PlannerPlanRecipeCommands;
  readonly machineCommands: PlannerPlanMachineCommands;
  readonly objectiveCommands: PlannerPlanObjectiveCommands;
  readonly displayCommands: PlannerPlanDisplayCommands;
  readonly noteCommands: PlannerPlanNoteCommands;
}

export const PLANNER_PLAN_CONFIG_STORE_PORT = new InjectionToken<PlannerPlanConfigStorePort>(
  'PLANNER_PLAN_CONFIG_STORE_PORT',
  {
    providedIn: 'root',
    factory: createPlannerPlanConfigStorePort,
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerPlanConfigStore implements PlannerPlanConfigReadModel, PlannerPlanConfigCommands {
  private readonly port = inject(PLANNER_PLAN_CONFIG_STORE_PORT);

  public readonly recipeSearch = signal('');

  public readonly activePlanId = computed(() => this.port.activeProject()?.id ?? null);
  public readonly hasActivePlan = computed(() => this.port.activeProject() !== null);
  public readonly editingLocked = computed(
    () => this.port.activeProject()?.buildState.planLocked ?? false,
  );
  public readonly targetRows = computed(() => this.port.activeProject()?.targets ?? []);
  public readonly planNotes = computed(() => this.port.activeProject()?.notes ?? '');
  public readonly objectiveProfile = computed(
    () => this.port.activeProject()?.objectiveProfile ?? null,
  );
  public readonly graphDisplaySettings = computed(
    () => this.port.activeProject()?.graphDisplay ?? null,
  );

  public readonly itemOptions = computed(() => selectItemOptions(this.port.dataset()));

  public readonly externalInputRows = computed(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    return dataset && project ? selectExternalInputRows(dataset, project) : [];
  });

  public readonly resourceRows = computed(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    return dataset && project ? selectResourceRows(dataset, project) : [];
  });

  public readonly rawResourceMultiplierRows = computed(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    return dataset && project ? selectRawResourceMultiplierRows(dataset, project.objectiveProfile) : [];
  });

  public readonly recipeRows = computed(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    return dataset && project ? selectRecipeRows(dataset, project, this.recipeSearch()) : [];
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

  public readonly machineRows = computed(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    return dataset && project ? selectMachineRows(dataset, project, this.port.solveResult()) : [];
  });

  public readonly machinePanelSummary = computed(() =>
    selectMachinePanelSummary(this.port.solveResult()),
  );

  private readonly planCommands = new PlannerPlanCommandSlice({
    dataset: this.port.dataset,
    activeProject: this.port.activeProject,
    itemOptions: this.itemOptions,
    planLocked: () => this.editingLocked(),
    updateActiveProject: this.port.updateActiveProject,
  });

  public readonly targetCommands: PlannerPlanTargetCommands = {
    add: () => this.planCommands.addTarget(),
    duplicate: (target) => this.planCommands.duplicateTarget(target),
    remove: (targetId) => this.planCommands.removeTarget(targetId),
    updateItem: (targetId, itemId) => this.planCommands.updateTargetItem(targetId, itemId),
    updateMode: (targetId, mode) => this.planCommands.updateTargetMode(targetId, mode),
    updateAmount: (targetId, amountPerMinute) =>
      this.planCommands.updateTargetAmount(targetId, amountPerMinute),
  };

  public readonly inputCommands: PlannerPlanInputCommands = {
    addFirstAvailable: () => this.planCommands.addExternalInput(),
    set: (itemId, amountPerMinute) => this.planCommands.setItemInput(itemId, amountPerMinute),
    move: (previousItemId, nextItemId) =>
      this.planCommands.updateExternalInputItem(previousItemId, nextItemId),
    remove: (itemId) => this.planCommands.removeExternalInput(itemId),
  };

  public readonly resourceCommands: PlannerPlanResourceCommands = {
    setCap: (itemId, maxPerMinute) => this.planCommands.setResourceCap(itemId, maxPerMinute),
    setEnabled: (itemId, enabled) => this.planCommands.setResourceEnabled(itemId, enabled),
    reset: (itemId) => this.planCommands.resetResource(itemId),
    resetAll: () => this.planCommands.resetAllResources(),
    setAllEnabled: (enabled) => this.planCommands.setAllResourcesEnabled(enabled),
  };

  public readonly recipeCommands: PlannerPlanRecipeCommands = {
    setEnabled: (recipeId, enabled) => this.planCommands.setRecipeEnabled(recipeId, enabled),
    setManyEnabled: (recipeIds, enabled) => this.planCommands.setRecipesEnabled(recipeIds, enabled),
    setGroupEnabled: (isAlternate, enabled) =>
      this.planCommands.setRecipeGroupEnabled(isAlternate, enabled),
  };

  public readonly machineCommands: PlannerPlanMachineCommands = {
    setEnabled: (machineId, enabled) => this.planCommands.setMachineEnabled(machineId, enabled),
  };

  public readonly objectiveCommands: PlannerPlanObjectiveCommands = {
    setPreset: (presetId) => this.planCommands.setObjectivePreset(presetId),
    setWeight: (key, value) => this.planCommands.setObjectiveWeight(key, value),
    setRawResourceMultiplier: (itemId, value) =>
      this.planCommands.setObjectiveRawResourceMultiplier(itemId, value),
    resetRawResourceMultiplier: (itemId) =>
      this.planCommands.resetObjectiveRawResourceMultiplier(itemId),
  };

  public readonly displayCommands: PlannerPlanDisplayCommands = {
    setMaxBeltTier: (maxBeltTier) => this.planCommands.setMaxBeltTier(maxBeltTier),
    setMaxPipeTier: (maxPipeTier) => this.planCommands.setMaxPipeTier(maxPipeTier),
    setRateDecimalPlaces: (rateDecimalPlaces) =>
      this.planCommands.setRateDecimalPlaces(rateDecimalPlaces),
    setGraphEdgeStyle: (edgeStyle) => this.planCommands.setGraphEdgeStyle(edgeStyle),
    setShowTransportLabels: (showTransportLabels) =>
      this.planCommands.setShowTransportLabels(showTransportLabels),
    setAnimateFlowLines: (animateFlowLines) =>
      this.planCommands.setAnimateFlowLines(animateFlowLines),
  };

  public readonly noteCommands: PlannerPlanNoteCommands = {
    set: (notes) => this.planCommands.setPlanNotes(notes),
    clear: () => this.planCommands.setPlanNotes(''),
  };
}

function createPlannerPlanConfigStorePort(): PlannerPlanConfigStorePort {
  const datasetService = inject(DatasetService);
  const workspace = inject(PlannerWorkspaceSlice);
  const solver = inject(PlannerSolverService);

  return {
    dataset: datasetService.dataset,
    activeProject: workspace.activeProject,
    solveResult: solver.solveResult,
    updateActiveProject: (mapper) => workspace.updateActiveProject(mapper),
  };
}
