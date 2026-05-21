import { inject, Injectable, type OnDestroy } from '@angular/core';
import { DatasetService } from '../dataset.service';
import { PlannerPersistenceCoordinatorService } from '../persistence/planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphStore } from './planner-graph.store';
import { PlannerWorkspaceSlice } from './planner-store.workspace';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { PlannerWorkbenchSlice } from '../workbench/planner-workbench-state';

@Injectable({ providedIn: 'root' })
export class PlannerStoreService implements OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly persistenceCoordinator = inject(PlannerPersistenceCoordinatorService);
  private readonly solver = inject(PlannerSolverService);

  private readonly workspace = inject(PlannerWorkspaceSlice);
  private readonly graphStore = inject(PlannerGraphStore);
  private readonly workbench = inject(PlannerWorkbenchSlice);
  private readonly connections: PlannerStoreConnections;

  public constructor() {
    this.workspace.connectGraphHooks({
      flushPendingGraphState: () => this.graphStore.lifecycle.flushPendingState(),
      clearPendingGraphState: () => this.graphStore.lifecycle.clearPendingState(),
      clearGraphSelection: () => this.graphStore.selectionCommands.clear(),
    });
    this.workspace.connectActivationHooks({
      projectActivated: (project) => this.workbench.activateProject(project),
    });
    this.connections = new PlannerStoreConnections({
      dataset: this.datasetService.dataset,
      projects: this.workspace.projects,
      sessions: this.workspace.sessions,
      activeSessionId: this.workspace.activeSessionId,
      activeProjectId: this.workspace.activeProjectId,
      userDefaults: this.workspace.userDefaults,
      activeProject: this.workspace.activeProject,
      initializeFromStoredState: (state) => this.workspace.initializeFromStoredState(state),
      initializeStarterProject: (dataset, userDefaults) =>
        this.workspace.initializeStarterProject(dataset, userDefaults),
    });

    this.connections.connect(this.persistenceCoordinator, this.solver);
  }

  public ngOnDestroy(): void {
    this.graphStore.layoutCommands.flushNodePositions();
  }
}
