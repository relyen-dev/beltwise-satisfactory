import { computed, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  type GraphNodeBuildState,
  type PlannerProject,
  type PlannerUserDefaults,
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
  selectMachinePanelSummary,
  selectMachineRows,
  selectMachineUsageRows,
  selectProductionGraphInput,
  selectRecipeRows,
  selectResourceRows,
} from './planner-store.selectors';
import { selectInspectorViewModel } from './planner-inspector.selectors';

interface PlannerStoreViewSelectorOptions {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly userDefaults: Signal<PlannerUserDefaults | null>;
  readonly recipeSearch: Signal<string>;
  readonly defaultRecipeSearch: Signal<string>;
  readonly selectedGraphNodeId: Signal<string | null>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
}

export class PlannerStoreViewSelectors {
  private readonly options: PlannerStoreViewSelectorOptions;
  private readonly productionGraphInput: Signal<ReturnType<typeof selectProductionGraphInput>>;

  public readonly itemOptions: Signal<ReturnType<typeof selectItemOptions>>;
  public readonly resourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  public readonly defaultResourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  public readonly externalInputRows: Signal<ReturnType<typeof selectExternalInputRows>>;
  public readonly machineRows: Signal<ReturnType<typeof selectMachineRows>>;
  public readonly defaultMachineRows: Signal<ReturnType<typeof selectMachineRows>>;
  public readonly machinePanelSummary: Signal<ReturnType<typeof selectMachinePanelSummary>>;
  public readonly machineUsageRows: Signal<ReturnType<typeof selectMachineUsageRows>>;
  public readonly recipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly defaultRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly baseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly defaultBaseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly standardBaseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly defaultStandardBaseRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly converterResourceRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly defaultConverterResourceRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly alternateRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly defaultAlternateRecipeRows: Signal<ReturnType<typeof selectRecipeRows>>;
  public readonly graph: Signal<ProductionGraph | null>;
  public readonly planLocked: Signal<boolean>;
  public readonly nodeLayoutLocked: Signal<boolean>;
  public readonly completedGraphNodeIds: Signal<ReadonlySet<string>>;
  public readonly graphNodeNotes: Signal<Readonly<Record<string, string>>>;
  public readonly graphDisplaySettings: Signal<PlannerProject['graphDisplay'] | null>;
  public readonly defaultGraphDisplaySettings: Signal<PlannerUserDefaults['graphDisplay'] | null>;
  public readonly selectedGraphNode: Signal<ProductionGraphNode | null>;
  public readonly selectedGraphNodeState: Signal<GraphNodeBuildState>;
  public readonly inspectorViewModel: Signal<ReturnType<typeof selectInspectorViewModel>>;

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

    this.defaultResourceRows = computed(() => {
      const dataset = this.options.dataset();
      const userDefaults = this.options.userDefaults();
      if (!dataset || !userDefaults) {
        return [];
      }
      return selectResourceRows(dataset, userDefaults);
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
      return selectMachineRows(dataset, project, this.options.solveResult());
    });

    this.defaultMachineRows = computed(() => {
      const dataset = this.options.dataset();
      const userDefaults = this.options.userDefaults();
      if (!dataset || !userDefaults) {
        return [];
      }
      return selectMachineRows(dataset, userDefaults);
    });

    this.machinePanelSummary = computed(() =>
      selectMachinePanelSummary(this.options.solveResult()),
    );

    this.machineUsageRows = computed(() => selectMachineUsageRows(this.options.solveResult()));

    this.recipeRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }

      return selectRecipeRows(dataset, project, this.options.recipeSearch());
    });

    this.defaultRecipeRows = computed(() => {
      const dataset = this.options.dataset();
      const userDefaults = this.options.userDefaults();
      if (!dataset || !userDefaults) {
        return [];
      }

      return selectRecipeRows(dataset, userDefaults, this.options.defaultRecipeSearch());
    });

    this.baseRecipeRows = computed(() =>
      this.recipeRows().filter((row) => !row.recipe.isAlternate),
    );

    this.defaultBaseRecipeRows = computed(() =>
      this.defaultRecipeRows().filter((row) => !row.recipe.isAlternate),
    );

    this.standardBaseRecipeRows = computed(() =>
      this.baseRecipeRows().filter((row) => !row.isConverterResourceRecipe),
    );

    this.defaultStandardBaseRecipeRows = computed(() =>
      this.defaultBaseRecipeRows().filter((row) => !row.isConverterResourceRecipe),
    );

    this.converterResourceRecipeRows = computed(() =>
      this.baseRecipeRows().filter((row) => row.isConverterResourceRecipe),
    );

    this.defaultConverterResourceRecipeRows = computed(() =>
      this.defaultBaseRecipeRows().filter((row) => row.isConverterResourceRecipe),
    );

    this.alternateRecipeRows = computed(() =>
      this.recipeRows().filter((row) => row.recipe.isAlternate),
    );

    this.defaultAlternateRecipeRows = computed(() =>
      this.defaultRecipeRows().filter((row) => row.recipe.isAlternate),
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

    this.defaultGraphDisplaySettings = computed(
      () => this.options.userDefaults()?.graphDisplay ?? null,
    );

    this.selectedGraphNode = computed<ProductionGraphNode | null>(() => {
      return selectGraphNode(this.graph(), this.options.selectedGraphNodeId());
    });

    this.selectedGraphNodeState = computed<GraphNodeBuildState>(() => {
      return selectGraphNodeState(this.options.activeProject(), this.options.selectedGraphNodeId());
    });

    this.inspectorViewModel = computed(() => {
      return selectInspectorViewModel(
        this.options.dataset(),
        this.options.activeProject(),
        this.options.solveResult(),
        this.selectedGraphNode(),
        this.selectedGraphNodeState(),
      );
    });
  }
}
