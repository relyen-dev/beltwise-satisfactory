import {
  type EffectRef,
  effect,
  inject,
  Injectable,
  Injector,
  type Signal,
  untracked,
} from '@angular/core';
import type { GameDataset } from '@beltwise/game-data';
import type { PlannerProject } from '@beltwise/planner-core';
import { PlannerPersistenceService, type LoadedPlannerState } from './planner-persistence.service';

export { createStoredPlannerState } from './planner-persistence.service';

export interface PlannerPersistenceCoordinatorBinding {
  readonly dataset: Signal<GameDataset | null>;
  readonly projects: Signal<PlannerProject[]>;
  readonly activeProjectId: Signal<string | undefined>;
  readonly initializeFromStoredState: (state: LoadedPlannerState) => void;
  readonly initializeStarterProject: (dataset: GameDataset) => void;
}

@Injectable({ providedIn: 'root' })
export class PlannerPersistenceCoordinatorService {
  private readonly injector = inject(Injector);
  private readonly persistence = inject(PlannerPersistenceService);
  private initialized = false;
  private initializeEffect: EffectRef | undefined;
  private saveEffect: EffectRef | undefined;

  public connect(binding: PlannerPersistenceCoordinatorBinding): void {
    this.initializeEffect?.destroy();
    this.saveEffect?.destroy();
    this.initialized = false;

    this.initializeEffect = effect(
      () => {
        const dataset = binding.dataset();
        if (!dataset || this.initialized) {
          return;
        }
        this.initializePlannerState(binding, dataset);
      },
      { injector: this.injector },
    );

    this.saveEffect = effect(
      () => {
        const projects = binding.projects();
        const activeProjectId = binding.activeProjectId();
        if (!this.initialized) {
          return;
        }
        untracked(() => this.saveState(projects, activeProjectId));
      },
      { injector: this.injector },
    );
  }

  public loadInitialState(dataset: GameDataset): LoadedPlannerState | null {
    return this.persistence.load(dataset);
  }

  public saveState(projects: PlannerProject[], activeProjectId: string | undefined): void {
    if (projects.length === 0) {
      return;
    }
    this.persistence.saveProjects(projects, activeProjectId);
  }

  private initializePlannerState(
    binding: PlannerPersistenceCoordinatorBinding,
    dataset: GameDataset,
  ): void {
    this.initialized = true;
    const stored = this.loadInitialState(dataset);
    if (stored && stored.projects.length > 0) {
      binding.initializeFromStoredState(stored);
    } else {
      binding.initializeStarterProject(dataset);
    }
  }
}
