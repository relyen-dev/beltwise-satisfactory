import { computed, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  type GraphNodeBuildState,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import {
  buildProductionGraphFromInput,
  equalProductionGraphInputs,
  selectCompletedGraphNodeIds,
  selectExternalInputRows,
  selectGraphNode,
  selectGraphNodeNotes,
  selectGraphNodeState,
  selectItemOptions,
  selectMachineRows,
  selectMachineUsageRows,
  selectProductionGraphInput,
  selectRecipeRows,
  selectResourceRows,
} from './planner-store.selectors';

interface PlannerStoreViewSelectorOptions {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly recipeSearch: Signal<string>;
  readonly selectedGraphNodeId: Signal<string | null>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
}

export class PlannerStoreViewSelectors {
  private readonly options: PlannerStoreViewSelectorOptions;
  private readonly productionGraphInput: Signal<ReturnType<typeof selectProductionGraphInput>>;

  public readonly itemOptions: Signal<ReturnType<typeof selectItemOptions>>;
  public readonly resourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  public readonly externalInputRows: Signal<ReturnType<typeof selectExternalInputRows>>;
  public readonly machineRows: Signal<ReturnType<typeof selectMachineRows>>;
  public readonly machineUsageRows: Signal<ReturnType<typeof selectMachineUsageRows>>;
  public readonly recipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly baseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly alternateRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly graph: Signal<ProductionGraph | null>;
  public readonly planLocked: Signal<boolean>;
  public readonly nodeLayoutLocked: Signal<boolean>;
  public readonly completedGraphNodeIds: Signal<ReadonlySet<string>>;
  public readonly graphNodeNotes: Signal<Readonly<Record<string, string>>>;
  public readonly graphDisplaySettings: Signal<PlannerProject['graphDisplay'] | null>;
  public readonly selectedGraphNode: Signal<ProductionGraphNode | null>;
  public readonly selectedGraphNodeState: Signal<GraphNodeBuildState>;

  public constructor(options: PlannerStoreViewSelectorOptions) {
    this.options = options;
    this.itemOptions = computed(() => {
      return selectItemOptions(this.options.dataset());
    });

    this.resourceRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }
      return selectResourceRows(dataset, project);
    });

    this.externalInputRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }

      return selectExternalInputRows(dataset, project);
    });

    this.machineRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }
      return selectMachineRows(dataset, project);
    });

    this.machineUsageRows = computed(() => selectMachineUsageRows(this.options.solveResult()));

    this.recipeRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }

      return selectRecipeRows(dataset, project, this.options.recipeSearch());
    });

    this.baseRecipeRows = computed(() =>
      this.recipeRows().filter((row) => !row.recipe.isAlternate),
    );

    this.alternateRecipeRows = computed(() =>
      this.recipeRows().filter((row) => row.recipe.isAlternate),
    );

    this.productionGraphInput = computed(
      () =>
        selectProductionGraphInput(
          this.options.dataset(),
          this.options.activeProject(),
          this.options.solveResult(),
        ),
      { equal: equalProductionGraphInputs },
    );

    this.graph = computed<ProductionGraph | null>(() => {
      const input = this.productionGraphInput();
      return input ? buildProductionGraphFromInput(input) : null;
    });

    this.planLocked = computed(() => this.options.activeProject()?.buildState.planLocked ?? false);

    this.nodeLayoutLocked = computed(
      () => this.options.activeProject()?.buildState.nodeLayoutLocked ?? false,
    );

    this.completedGraphNodeIds = computed<ReadonlySet<string>>(() => {
      return selectCompletedGraphNodeIds(this.options.activeProject());
    });

    this.graphNodeNotes = computed<Readonly<Record<string, string>>>(() => {
      return selectGraphNodeNotes(this.options.activeProject());
    });

    this.graphDisplaySettings = computed(() => this.options.activeProject()?.graphDisplay ?? null);

    this.selectedGraphNode = computed<ProductionGraphNode | null>(() => {
      return selectGraphNode(this.graph(), this.options.selectedGraphNodeId());
    });

    this.selectedGraphNodeState = computed<GraphNodeBuildState>(() => {
      return selectGraphNodeState(this.options.activeProject(), this.options.selectedGraphNodeId());
    });
  }
}
