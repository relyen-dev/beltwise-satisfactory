import { computed, signal, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import { createStableId, type PlannerProject } from '@beltwise/planner-core';
import { createStarterProject } from './planner-domain.helpers';
import { type LoadedPlannerState } from './planner-persistence.service';
import * as projectMutations from './planner-project-mutations';
import {
  type ConfigurationTab,
  type WorkbenchFocusMode,
  type WorkbenchFocusRequest,
} from './planner-store.models';

interface PlannerWorkspaceSliceOptions {
  readonly dataset: Signal<GameDataset | null>;
}

interface PlannerWorkspaceGraphHooks {
  readonly flushPendingGraphState: () => void;
  readonly clearPendingGraphState: () => void;
  readonly clearGraphSelection: () => void;
}

const noopGraphHooks: PlannerWorkspaceGraphHooks = {
  flushPendingGraphState: () => undefined,
  clearPendingGraphState: () => undefined,
  clearGraphSelection: () => undefined,
};

export class PlannerWorkspaceSlice {
  private graphHooks = noopGraphHooks;
  private focusRequestSequence = 0;

  public readonly projects = signal<PlannerProject[]>([]);
  public readonly activeProjectId = signal<string | undefined>(undefined);
  public readonly activeConfigTab = signal<ConfigurationTab>('plan');
  public readonly workbenchFocusRequest = signal<WorkbenchFocusRequest | null>(null);

  public readonly activeProject = computed(() => {
    const activeId = this.activeProjectId();
    return this.projects().find((project) => project.id === activeId) ?? this.projects()[0] ?? null;
  });

  public constructor(private readonly options: PlannerWorkspaceSliceOptions) {}

  public connectGraphHooks(hooks: PlannerWorkspaceGraphHooks): void {
    this.graphHooks = hooks;
  }

  public selectProject(projectId: string): void {
    this.graphHooks.flushPendingGraphState();
    const project = this.projects().find((candidate) => candidate.id === projectId);
    if (!project) {
      return;
    }
    this.activateProject(project, projectFocusMode(project));
  }

  public createProject(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }
    const project = createStarterProject(dataset, `Plan ${this.projects().length + 1}`);
    this.projects.update((projects) => [...projects, project]);
    this.activateProject(project, 'open-plan');
  }

  public duplicateProject(): void {
    this.graphHooks.flushPendingGraphState();
    const project = this.activeProject();
    if (!project) {
      return;
    }
    const now = new Date().toISOString();
    const clone = projectMutations.duplicatePlannerProject(project, {
      id: createStableId('project'),
      now,
    });
    this.projects.update((projects) => [...projects, clone]);
    this.activateProject(clone, projectFocusMode(clone));
  }

  public deleteProject(): void {
    this.graphHooks.flushPendingGraphState();
    const activeId = this.activeProjectId();
    if (!activeId || this.projects().length <= 1) {
      return;
    }
    const remainingProjects = this.projects().filter((project) => project.id !== activeId);
    this.projects.set(remainingProjects);
    const nextProject = remainingProjects[0];
    if (nextProject) {
      this.activateProject(nextProject, projectFocusMode(nextProject));
    }
  }

  public renameProject(name: string): void {
    this.updateActiveProject((project) => ({ ...project, name }));
  }

  public initializeFromStoredState(state: LoadedPlannerState): void {
    this.graphHooks.clearPendingGraphState();
    this.projects.set(state.projects);
    const activeProject =
      state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0];
    if (activeProject) {
      this.activateProject(activeProject, projectFocusMode(activeProject));
      return;
    }
    this.activeProjectId.set(undefined);
  }

  public initializeStarterProject(dataset: GameDataset): void {
    this.graphHooks.clearPendingGraphState();
    const starter = createStarterProject(dataset);
    this.projects.set([starter]);
    this.activateProject(starter, 'open-plan');
  }

  public updateActiveProject(mapper: (project: PlannerProject) => PlannerProject): void {
    this.graphHooks.flushPendingGraphState();
    const activeId = this.activeProjectId();
    if (!activeId) {
      return;
    }
    const now = new Date().toISOString();
    this.projects.update((projects) =>
      projectMutations.updateProjectInList(projects, activeId, now, mapper),
    );
  }

  public updateProjectById(
    projectId: string,
    mapper: (project: PlannerProject) => PlannerProject,
  ): void {
    const now = new Date().toISOString();
    this.projects.update((projects) => {
      let changed = false;
      const nextProjects = projects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }
        const nextProject = mapper(project);
        if (nextProject === project) {
          return project;
        }
        changed = true;
        return {
          ...nextProject,
          updatedAt: now,
        };
      });
      return changed ? nextProjects : projects;
    });
  }

  private activateProject(project: PlannerProject, focusMode: WorkbenchFocusMode): void {
    this.activeProjectId.set(project.id);
    this.graphHooks.clearGraphSelection();
    if (focusMode === 'open-plan') {
      this.activeConfigTab.set('plan');
    }
    this.workbenchFocusRequest.set({
      projectId: project.id,
      mode: focusMode,
      sequence: ++this.focusRequestSequence,
    });
  }
}

function projectFocusMode(project: PlannerProject): WorkbenchFocusMode {
  return project.targets.some((target) => target.itemId.trim().length > 0)
    ? 'focus-graph'
    : 'open-plan';
}
