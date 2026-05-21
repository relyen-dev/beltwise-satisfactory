import { inject, Injectable, type OnDestroy } from '@angular/core';
import { DatasetService } from '../dataset.service';
import { PlannerPersistenceCoordinatorService } from '../persistence/planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphStore } from './planner-graph.store';
import { PlannerWorkspaceSlice } from './planner-store.workspace';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { PlannerWorkbenchSlice } from '../workbench/planner-workbench-state';
import { type WorkbenchPanelId } from '../workbench/planner-workbench.models';

export { plannerRelevantMachineIds } from '@beltwise/planner-core';
export {
  createGameDatasetSolveKey,
  createPlannerSolveKey,
  selectPlannerSolveInput,
} from '../solving/planner-solve-input';
export type { PlannerSolveInput, PlannerSolveKey } from '../solving/planner-solve-input';
export {
  PLANNER_SOLVE_DEBOUNCE_MS,
  PlannerSolveScheduler,
  PlannerSolverService,
} from '../solving/planner-solver.service';
export type { SolveStatus } from '../solving/planner-solver.service';
export type {
  WorkbenchFocusMode,
  WorkbenchFocusRequest,
  WorkbenchPanelId,
} from '../workbench/planner-workbench.models';

@Injectable({ providedIn: 'root' })
export class PlannerStoreService implements OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly persistenceCoordinator = inject(PlannerPersistenceCoordinatorService);
  private readonly solver = inject(PlannerSolverService);

  private readonly workspace = inject(PlannerWorkspaceSlice);
  private readonly graphStore = inject(PlannerGraphStore);
  private readonly workbench: PlannerWorkbenchSlice;
  private readonly connections: PlannerStoreConnections;

  public readonly dataset = this.datasetService.dataset;
  public readonly datasetError = this.datasetService.loadError;
  public readonly solveStatus = this.solver.solveStatus;
  public readonly solveError = this.solver.solveError;
  public readonly solveResult = this.solver.solveResult;

  public readonly sessions: PlannerWorkspaceSlice['sessions'];
  public readonly activeSessionId: PlannerWorkspaceSlice['activeSessionId'];
  public readonly activeSession: PlannerWorkspaceSlice['activeSession'];
  public readonly activeSessionProjects: PlannerWorkspaceSlice['activeSessionProjects'];
  public readonly projects: PlannerWorkspaceSlice['projects'];
  public readonly activeProjectId: PlannerWorkspaceSlice['activeProjectId'];
  public readonly userDefaults: PlannerWorkspaceSlice['userDefaults'];
  public readonly activeWorkbenchPanelId: PlannerWorkbenchSlice['activePanelId'];
  public readonly workbenchFocusRequest: PlannerWorkbenchSlice['focusRequest'];
  public readonly activeProject: PlannerWorkspaceSlice['activeProject'];

  public constructor() {
    this.workbench = new PlannerWorkbenchSlice();
    this.workspace.connectGraphHooks({
      flushPendingGraphState: () => this.graphStore.lifecycle.flushPendingState(),
      clearPendingGraphState: () => this.graphStore.lifecycle.clearPendingState(),
      clearGraphSelection: () => this.graphStore.selectionCommands.clear(),
    });
    this.workspace.connectActivationHooks({
      projectActivated: (project) => this.workbench.activateProject(project),
    });
    this.connections = new PlannerStoreConnections({
      dataset: this.dataset,
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

    this.sessions = this.workspace.sessions;
    this.activeSessionId = this.workspace.activeSessionId;
    this.activeSession = this.workspace.activeSession;
    this.activeSessionProjects = this.workspace.activeSessionProjects;
    this.projects = this.workspace.projects;
    this.activeProjectId = this.workspace.activeProjectId;
    this.userDefaults = this.workspace.userDefaults;
    this.activeWorkbenchPanelId = this.workbench.activePanelId;
    this.workbenchFocusRequest = this.workbench.focusRequest;
    this.activeProject = this.workspace.activeProject;

    this.connections.connect(this.persistenceCoordinator, this.solver);
  }

  public ngOnDestroy(): void {
    this.graphStore.layoutCommands.flushNodePositions();
  }

  public selectProject(projectId: string): void {
    this.workspace.selectProject(projectId);
  }

  public selectSession(sessionId: string): void {
    this.workspace.selectSession(sessionId);
  }

  public setActiveWorkbenchPanel(panelId: WorkbenchPanelId): void {
    this.workbench.setActivePanel(panelId);
  }

  public createSession(): void {
    this.workspace.createSession();
  }

  public deleteSession(sessionId?: string): void {
    this.workspace.deleteSession(sessionId);
  }

  public renameSession(name: string): void {
    this.workspace.renameSession(name);
  }

  public createProject(): void {
    this.workspace.createProject();
  }

  public duplicateProject(): void {
    this.workspace.duplicateProject();
  }

  public deleteProject(): void {
    this.workspace.deleteProject();
  }

  public renameProject(name: string): void {
    this.workspace.renameProject(name);
  }
}
