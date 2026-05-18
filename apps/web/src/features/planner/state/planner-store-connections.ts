import { computed, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
} from '@beltwise/planner-core';
import {
  type PlannerPersistenceCoordinatorBinding,
  type PlannerPersistenceCoordinatorService,
} from '../persistence/planner-persistence-coordinator.service';
import { type LoadedPlannerState } from '../persistence/planner-persistence.service';
import {
  equalPlannerSolveInputs,
  selectPlannerSolveInput as selectPlannerSolveInputForStore,
  type PlannerSolveInput,
} from '../solving/planner-solve-input';
import { type PlannerSolverService } from '../solving/planner-solver.service';

interface PlannerStoreConnectionPorts {
  readonly dataset: Signal<GameDataset | null>;
  readonly projects: Signal<PlannerProject[]>;
  readonly sessions: Signal<PlannerSession[]>;
  readonly activeSessionId: Signal<string | undefined>;
  readonly activeProjectId: Signal<string | undefined>;
  readonly userDefaults: Signal<PlannerUserDefaults | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly initializeFromStoredState: (state: LoadedPlannerState) => void;
  readonly initializeStarterProject: (
    dataset: GameDataset,
    userDefaults?: PlannerUserDefaults,
  ) => void;
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
      sessions: this.ports.sessions,
      activeSessionId: this.ports.activeSessionId,
      activeProjectId: this.ports.activeProjectId,
      userDefaults: this.ports.userDefaults,
      initializeFromStoredState: this.ports.initializeFromStoredState,
      initializeStarterProject: this.ports.initializeStarterProject,
    };
  }
}
