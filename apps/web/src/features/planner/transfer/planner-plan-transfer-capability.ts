import { inject, InjectionToken, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  createBeltwisePlanExportFilename,
  createUniqueImportedPlannerProjectName,
  decodeBeltwisePlanShare,
  encodeBeltwisePlanExport,
  encodeBeltwisePlanShare,
  parseBeltwisePlanExportJson,
  prepareImportedPlannerProject,
  stringifyBeltwisePlanExport,
  type BeltwisePlanImportWarning,
  type BeltwisePlanSharePayload,
  type PlannerProject,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerGraphStore } from '../state/planner-graph.store';
import { PlannerWorkspaceSlice } from '../state/planner-store.workspace';

export interface PlannerPlanTransferPort {
  readonly exportActivePlan: () => PlannerPlanExportResult;
  readonly importPlanJson: (json: string) => PlannerPlanImportResult;
  readonly exportActivePlanSharePayload: () => PlannerPlanShareExportResult;
  readonly importPlanSharePayload: (payload: unknown) => PlannerPlanImportResult;
}

export interface PlannerPlanTransferStorePort {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly activeSessionProjects: Signal<readonly PlannerProject[]>;
  readonly flushGraphNodePositions: () => void;
  readonly importProject: (project: PlannerProject) => void;
}

export type PlannerPlanExportResult =
  | {
      ok: true;
      filename: string;
      json: string;
    }
  | {
      ok: false;
      message: string;
    };

export type PlannerPlanImportResult =
  | {
      ok: true;
      project: PlannerProject;
      warnings: BeltwisePlanImportWarning[];
    }
  | {
      ok: false;
      message: string;
    };

export type PlannerPlanShareExportResult =
  | {
      ok: true;
      payload: BeltwisePlanSharePayload;
    }
  | {
      ok: false;
      message: string;
    };

export const PLANNER_PLAN_TRANSFER_PORT = new InjectionToken<PlannerPlanTransferPort>(
  'PLANNER_PLAN_TRANSFER_PORT',
  {
    providedIn: 'root',
    factory: createPlannerPlanTransferPort,
  },
);

export class PlannerPlanTransferCapability implements PlannerPlanTransferPort {
  public constructor(private readonly port: PlannerPlanTransferStorePort) {}

  public exportActivePlan(): PlannerPlanExportResult {
    this.port.flushGraphNodePositions();
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    if (!dataset || !project) {
      return { ok: false, message: 'There is no active plan to export yet.' };
    }

    const exportFile = encodeBeltwisePlanExport(project, { dataset });
    return {
      ok: true,
      filename: createBeltwisePlanExportFilename(project.name),
      json: stringifyBeltwisePlanExport(exportFile),
    };
  }

  public importPlanJson(json: string): PlannerPlanImportResult {
    const dataset = this.port.dataset();
    if (!dataset) {
      return { ok: false, message: 'Planner data is still loading. Try importing again shortly.' };
    }

    const decoded = parseBeltwisePlanExportJson(json, dataset);
    if (!decoded.ok) {
      return { ok: false, message: decoded.error.message };
    }

    return this.importDecodedPlan(decoded.project, decoded.warnings, dataset);
  }

  public exportActivePlanSharePayload(): PlannerPlanShareExportResult {
    this.port.flushGraphNodePositions();
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    if (!dataset || !project) {
      return { ok: false, message: 'There is no active plan to share yet.' };
    }

    return {
      ok: true,
      payload: encodeBeltwisePlanShare(project, dataset),
    };
  }

  public importPlanSharePayload(payload: unknown): PlannerPlanImportResult {
    const dataset = this.port.dataset();
    if (!dataset) {
      return { ok: false, message: 'Planner data is still loading. Try importing again shortly.' };
    }

    const decoded = decodeBeltwisePlanShare(payload, dataset);
    if (!decoded.ok) {
      return { ok: false, message: decoded.error.message };
    }

    return this.importDecodedPlan(decoded.project, decoded.warnings, dataset);
  }

  private importDecodedPlan(
    decodedProject: PlannerProject,
    warnings: BeltwisePlanImportWarning[],
    dataset: GameDataset,
  ): PlannerPlanImportResult {
    const name = createUniqueImportedPlannerProjectName(
      decodedProject.name,
      this.port.activeSessionProjects().map((project) => project.name),
    );
    const project = prepareImportedPlannerProject(decodedProject, { dataset, name });
    this.port.importProject(project);
    return {
      ok: true,
      project,
      warnings,
    };
  }
}

function createPlannerPlanTransferPort(): PlannerPlanTransferPort {
  const datasetService = inject(DatasetService);
  const workspace = inject(PlannerWorkspaceSlice);
  const graphStore = inject(PlannerGraphStore);

  return new PlannerPlanTransferCapability({
    dataset: datasetService.dataset,
    activeProject: workspace.activeProject,
    activeSessionProjects: workspace.activeSessionProjects,
    flushGraphNodePositions: () => graphStore.layoutCommands.flushNodePositions(),
    importProject: (project) => workspace.importProject(project),
  });
}
