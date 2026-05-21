import { computed, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  type PlannerProject,
  type PlannerUserDefaults,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import {
  selectExternalInputRows,
  selectItemOptions,
  selectMachinePanelSummary,
  selectMachineRows,
  selectMachineUsageRows,
  selectRecipeRows,
  selectRawResourceMultiplierRows,
  selectResourceRows,
} from './planner-store.selectors';

interface PlannerStoreViewSelectorOptions {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly userDefaults: Signal<PlannerUserDefaults | null>;
  readonly recipeSearch: Signal<string>;
  readonly defaultRecipeSearch: Signal<string>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
}

export class PlannerStoreViewSelectors {
  private readonly options: PlannerStoreViewSelectorOptions;

  public readonly itemOptions: Signal<ReturnType<typeof selectItemOptions>>;
  public readonly resourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  public readonly defaultResourceRows: Signal<ReturnType<typeof selectResourceRows>>;
  public readonly rawResourceMultiplierRows: Signal<
    ReturnType<typeof selectRawResourceMultiplierRows>
  >;
  public readonly defaultRawResourceMultiplierRows: Signal<
    ReturnType<typeof selectRawResourceMultiplierRows>
  >;
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
  public readonly defaultGraphDisplaySettings: Signal<PlannerUserDefaults['graphDisplay'] | null>;

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

    this.rawResourceMultiplierRows = computed(() => {
      const dataset = this.options.dataset();
      const project = this.options.activeProject();
      if (!dataset || !project) {
        return [];
      }
      return selectRawResourceMultiplierRows(dataset, project.objectiveProfile);
    });

    this.defaultRawResourceMultiplierRows = computed(() => {
      const dataset = this.options.dataset();
      const userDefaults = this.options.userDefaults();
      if (!dataset || !userDefaults) {
        return [];
      }
      return selectRawResourceMultiplierRows(dataset, userDefaults.objectiveProfile);
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

    this.defaultGraphDisplaySettings = computed(
      () => this.options.userDefaults()?.graphDisplay ?? null,
    );
  }
}
