import { computed, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import { type PlannerProject } from '@beltwise/planner-core';
import {
  type PlannerPersistenceCoordinatorBinding,
  type PlannerPersistenceCoordinatorService,
} from './planner-persistence-coordinator.service';
import { type LoadedPlannerState } from './planner-persistence.service';
import {
  equalPlannerSolveInputs,
  selectPlannerSolveInput as selectPlannerSolveInputForStore,
  type PlannerSolveInput,
} from './planner-solve-input';
import { type PlannerSolverService } from './planner-solver.service';

interface PlannerStoreConnectionPorts {
  readonly dataset: Signal<GameDataset | null>;
  readonly projects: Signal<PlannerProject[]>;
  readonly activeProjectId: Signal<string | undefined>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly initializeFromStoredState: (state: LoadedPlannerState) => void;
  readonly initializeStarterProject: (dataset: GameDataset) => void;
}

export class PlannerStoreConnections {
  public readonly solveInput: Signal<PlannerSolveInput | null>;

  public constructor(private readonly ports: PlannerStoreConnectionPorts) {
    this.solveInput = computed(
      () => selectPlannerSolveInputForStore(this.ports.activeProject(), this.ports.dataset()),
      { equal: equalPlannerSolveInputs },
    );
  }

  public connect(
    persistenceCoordinator: Pick<PlannerPersistenceCoordinatorService, 'connect'>,
    solver: Pick<PlannerSolverService, 'connect'>,
  ): void {
    persistenceCoordinator.connect(this.createPersistenceBinding());
    solver.connect(this.solveInput);
  }

  private createPersistenceBinding(): PlannerPersistenceCoordinatorBinding {
    return {
      dataset: this.ports.dataset,
      projects: this.ports.projects,
      activeProjectId: this.ports.activeProjectId,
      initializeFromStoredState: this.ports.initializeFromStoredState,
      initializeStarterProject: this.ports.initializeStarterProject,
    };
  }
}
