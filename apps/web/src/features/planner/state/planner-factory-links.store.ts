import { computed, inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import { type GameDataset, type Item, type ItemId } from '@beltwise/game-data';
import {
  createStableId,
  mutatePlanItemInputs,
  selectPlannerSessionLinkHealth,
  targetOutputAmountForTarget,
  type PlannerProject,
  type PlannerSession,
  type PlannerSessionLink,
  type PlannerSessionLinkHealth,
  type ProductTarget,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { gameIconPathForItemId } from '../shared-ui/game-icon.helpers';
import { formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

export interface FactoryLinkSourceTargetOption {
  readonly targetId: string;
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly iconSrc: string;
  readonly amountPerMinute: number;
  readonly amountPerMinuteLabel: string;
}

export interface FactoryLinkDestinationProjectOption {
  readonly projectId: string;
  readonly name: string;
}

export interface FactoryLinkRow {
  readonly link: PlannerSessionLink;
  readonly item: Item | null;
  readonly iconSrc: string;
  readonly itemLabel: string;
  readonly amountPerMinuteLabel: string;
  readonly otherPlanLabel: string;
  readonly statusLabel: string;
  readonly warningLabel: string | null;
  readonly paused: boolean;
  readonly sourceAvailableAmountPerMinuteLabel: string | null;
  readonly sourceCommittedAmountPerMinuteLabel: string | null;
  readonly destinationCoveredAmountPerMinuteLabel: string | null;
  readonly destinationRequiredAmountPerMinuteLabel: string | null;
}

export interface FactoryLinkInputCoverageRow {
  readonly itemId: ItemId;
  readonly linkedAmountPerMinute: number;
  readonly manualRemainderAmountPerMinute: number;
  readonly linkedAmountPerMinuteLabel: string;
  readonly manualRemainderAmountPerMinuteLabel: string;
}

export interface StartFactoryLinkDraftOptions {
  readonly targetId: string;
  readonly itemId: ItemId;
}

export interface CreateFactoryLinkOptions {
  readonly sourceTargetId: string;
  readonly destinationProjectId: string;
  readonly destinationItemId: ItemId;
  readonly amountPerMinute: number;
}

export interface PlannerFactoryLinksStorePort {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeSession: Signal<PlannerSession | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly activeSessionProjects: Signal<readonly PlannerProject[]>;
  readonly projects: Signal<readonly PlannerProject[]>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
  readonly updateActiveSession: (mapper: (session: PlannerSession) => PlannerSession) => void;
  readonly updateProjectById: (
    projectId: string,
    mapper: (project: PlannerProject) => PlannerProject,
  ) => void;
}

export const PLANNER_FACTORY_LINKS_STORE_PORT = new InjectionToken<PlannerFactoryLinksStorePort>(
  'PLANNER_FACTORY_LINKS_STORE_PORT',
  {
    providedIn: 'root',
    factory: createPlannerFactoryLinksStorePort,
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerFactoryLinksStore {
  private readonly port = inject(PLANNER_FACTORY_LINKS_STORE_PORT);

  public readonly draftSourceTarget = signal<StartFactoryLinkDraftOptions | null>(null);

  private readonly linkHealth = computed(() => {
    const session = this.port.activeSession();
    if (!session) {
      return [];
    }
    const activeProject = this.port.activeProject();
    const solveResult = this.port.solveResult();
    return selectPlannerSessionLinkHealth({
      session,
      projects: this.port.projects(),
      ...(activeProject && solveResult
        ? { solveResultsByProjectId: { [activeProject.id]: solveResult } }
        : {}),
    });
  });

  public readonly sourceTargetOptions = computed<FactoryLinkSourceTargetOption[]>(() => {
    const dataset = this.port.dataset();
    const project = this.port.activeProject();
    if (!dataset || !project) {
      return [];
    }
    return project.targets
      .filter(isLinkableSourceTarget)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((target) => {
        const item = dataset.items[target.itemId];
        const amountPerMinute = targetOutputAmountForTarget(
          target,
          this.port.solveResult(),
          project.targets,
        );
        return {
          targetId: target.id,
          itemId: target.itemId,
          displayName: item?.displayName ?? target.itemId,
          iconSrc: gameIconPathForItemId(target.itemId),
          amountPerMinute,
          amountPerMinuteLabel: formatRate(amountPerMinute),
        };
      });
  });

  public readonly destinationProjectOptions = computed<FactoryLinkDestinationProjectOption[]>(
    () => {
      const activeProjectId = this.port.activeProject()?.id;
      return this.port
        .activeSessionProjects()
        .filter((project) => project.id !== activeProjectId)
        .map((project) => ({ projectId: project.id, name: project.name }));
    },
  );

  public readonly supplyingRows = computed<FactoryLinkRow[]>(() => {
    const activeProjectId = this.port.activeProject()?.id;
    if (!activeProjectId) {
      return [];
    }
    return this.linkHealth()
      .filter((health) => health.link.source.projectId === activeProjectId)
      .map((health) => this.linkRow(health, 'source'));
  });

  public readonly receivingRows = computed<FactoryLinkRow[]>(() => {
    const activeProjectId = this.port.activeProject()?.id;
    if (!activeProjectId) {
      return [];
    }
    return this.linkHealth()
      .filter((health) => health.link.destination.projectId === activeProjectId)
      .map((health) => this.linkRow(health, 'destination'));
  });

  public readonly inputCoverageRows = computed<FactoryLinkInputCoverageRow[]>(() => {
    const activeProject = this.port.activeProject();
    if (!activeProject) {
      return [];
    }
    const linkedAmounts = new Map<ItemId, number>();
    for (const health of this.linkHealth()) {
      const link = health.link;
      if (
        link.paused === true ||
        linkHealthHasMissingReference(health) ||
        link.destination.projectId !== activeProject.id ||
        link.destination.itemId !== link.itemId
      ) {
        continue;
      }
      linkedAmounts.set(link.itemId, (linkedAmounts.get(link.itemId) ?? 0) + link.amountPerMinute);
    }
    return Object.entries(activeProject.itemInputs).flatMap(([itemId, input]) => {
      const inputItemId = itemId as ItemId;
      const linkedAmountPerMinute = linkedAmounts.get(inputItemId) ?? 0;
      if (linkedAmountPerMinute <= 0) {
        return [];
      }
      const manualRemainderAmountPerMinute = Math.max(
        0,
        input.amountPerMinute - linkedAmountPerMinute,
      );
      return [
        {
          itemId: inputItemId,
          linkedAmountPerMinute,
          manualRemainderAmountPerMinute,
          linkedAmountPerMinuteLabel: formatRate(linkedAmountPerMinute),
          manualRemainderAmountPerMinuteLabel: formatRate(manualRemainderAmountPerMinute),
        },
      ];
    });
  });

  public startDraftFromTarget(options: StartFactoryLinkDraftOptions): void {
    const target = this.port
      .activeProject()
      ?.targets.find((candidate) => candidate.id === options.targetId);
    if (!target || target.itemId !== options.itemId || !isLinkableSourceTarget(target)) {
      return;
    }
    this.draftSourceTarget.set({ targetId: options.targetId, itemId: options.itemId });
  }

  public clearDraft(): void {
    this.draftSourceTarget.set(null);
  }

  public createLink(options: CreateFactoryLinkOptions): void {
    const activeProject = this.port.activeProject();
    const activeSession = this.port.activeSession();
    if (!activeProject || !activeSession || activeProject.buildState.planLocked) {
      return;
    }
    const sourceTarget = activeProject.targets.find(
      (target) => target.id === options.sourceTargetId,
    );
    if (
      !sourceTarget ||
      !isLinkableSourceTarget(sourceTarget) ||
      options.destinationItemId.length === 0 ||
      sourceTarget.itemId !== options.destinationItemId
    ) {
      return;
    }
    if (!activeSession.projectIds.includes(options.destinationProjectId)) {
      return;
    }
    if (options.destinationProjectId === activeProject.id) {
      return;
    }
    if (
      !this.port
        .activeSessionProjects()
        .some((project) => project.id === options.destinationProjectId)
    ) {
      return;
    }
    const amountPerMinute = sanitizeLinkAmount(options.amountPerMinute);
    if (amountPerMinute <= 0) {
      return;
    }

    const link: PlannerSessionLink = {
      id: createStableId('link'),
      itemId: sourceTarget.itemId,
      amountPerMinute,
      source: {
        kind: 'target-output',
        projectId: activeProject.id,
        targetId: sourceTarget.id,
      },
      destination: {
        kind: 'external-input',
        projectId: options.destinationProjectId,
        itemId: options.destinationItemId,
      },
    };

    this.port.updateActiveSession((session) => ({
      ...session,
      links: [...(session.links ?? []), link],
    }));
    this.ensureDestinationInputAtLeast(
      options.destinationProjectId,
      options.destinationItemId,
      amountPerMinute,
    );
    this.clearDraft();
  }

  public removeLink(linkId: string): void {
    this.port.updateActiveSession((session) => {
      const links = (session.links ?? []).filter((link) => link.id !== linkId);
      return links.length === (session.links ?? []).length ? session : { ...session, links };
    });
  }

  public setPaused(linkId: string, paused: boolean): void {
    this.updateLink(linkId, (link) => {
      if ((link.paused === true) === paused) {
        return link;
      }
      const { paused: _paused, ...rest } = link;
      return paused ? { ...rest, paused: true } : rest;
    });
  }

  public updateAmount(linkId: string, amountPerMinute: number): void {
    const sanitizedAmount = sanitizeLinkAmount(amountPerMinute);
    if (sanitizedAmount <= 0) {
      return;
    }
    const existingLink =
      this.port.activeSession()?.links.find((link) => link.id === linkId) ?? null;
    if (!existingLink) {
      return;
    }
    this.updateLink(linkId, (link) => {
      if (link.amountPerMinute === sanitizedAmount) {
        return link;
      }
      return { ...link, amountPerMinute: sanitizedAmount };
    });
    this.ensureDestinationInputAtLeast(
      existingLink.destination.projectId,
      existingLink.destination.itemId,
      sanitizedAmount,
    );
  }

  private updateLink(
    linkId: string,
    mapper: (link: PlannerSessionLink) => PlannerSessionLink,
  ): void {
    this.port.updateActiveSession((session) => {
      let changed = false;
      const links = (session.links ?? []).map((link) => {
        if (link.id !== linkId) {
          return link;
        }
        const nextLink = mapper(link);
        if (nextLink !== link) {
          changed = true;
        }
        return nextLink;
      });
      return changed ? { ...session, links } : session;
    });
  }

  private ensureDestinationInputAtLeast(
    projectId: string,
    itemId: ItemId,
    amountPerMinute: number,
  ): void {
    this.port.updateProjectById(projectId, (project) => {
      const currentAmount = project.itemInputs[itemId]?.amountPerMinute ?? 0;
      if (currentAmount >= amountPerMinute) {
        return project;
      }
      return mutatePlanItemInputs(project, {
        type: 'set-item-input',
        itemId,
        amountPerMinute,
      });
    });
  }

  private linkRow(
    health: PlannerSessionLinkHealth,
    activeRole: 'source' | 'destination',
  ): FactoryLinkRow {
    const dataset = this.port.dataset();
    const item = dataset?.items[health.link.itemId] ?? null;
    const otherProjectId =
      activeRole === 'source' ? health.link.destination.projectId : health.link.source.projectId;
    const otherPlanLabel =
      this.port.projects().find((project) => project.id === otherProjectId)?.name ?? 'Missing plan';
    return {
      link: health.link,
      item,
      iconSrc: gameIconPathForItemId(health.link.itemId),
      itemLabel: item?.displayName ?? health.link.itemId,
      amountPerMinuteLabel: formatRate(health.link.amountPerMinute),
      otherPlanLabel,
      statusLabel: health.link.paused === true ? 'Paused' : statusLabel(health.status),
      warningLabel: warningLabel(health),
      paused: health.link.paused === true,
      sourceAvailableAmountPerMinuteLabel:
        health.sourceAvailableAmountPerMinute === undefined
          ? null
          : formatRate(health.sourceAvailableAmountPerMinute),
      sourceCommittedAmountPerMinuteLabel:
        health.sourceCommittedAmountPerMinute === undefined
          ? null
          : formatRate(health.sourceCommittedAmountPerMinute),
      destinationCoveredAmountPerMinuteLabel:
        health.destinationCoveredAmountPerMinute === undefined
          ? null
          : formatRate(health.destinationCoveredAmountPerMinute),
      destinationRequiredAmountPerMinuteLabel:
        health.destinationRequiredAmountPerMinute === undefined
          ? null
          : formatRate(health.destinationRequiredAmountPerMinute),
    };
  }
}

function createPlannerFactoryLinksStorePort(): PlannerFactoryLinksStorePort {
  const datasetService = inject(DatasetService);
  const workspace = inject(PlannerWorkspaceSlice);
  const solver = inject(PlannerSolverService);
  return {
    dataset: datasetService.dataset,
    activeSession: workspace.activeSession,
    activeProject: workspace.activeProject,
    activeSessionProjects: workspace.activeSessionProjects,
    projects: workspace.projects,
    solveResult: solver.solveResult,
    updateActiveSession: (mapper) => workspace.updateActiveSession(mapper),
    updateProjectById: (projectId, mapper) => workspace.updateProjectById(projectId, mapper),
  };
}

function isLinkableSourceTarget(target: ProductTarget): boolean {
  return target.itemId.trim().length > 0;
}

function sanitizeLinkAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round((Math.max(0, value) + Number.EPSILON) * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatRate(amountPerMinute: number): string {
  return `${formatPlannerNumber(amountPerMinute)}/min`;
}

function statusLabel(status: PlannerSessionLinkHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'missing-source':
      return 'Missing source';
    case 'missing-destination':
      return 'Missing input';
    case 'source-short':
      return 'Source short';
    case 'source-overcommitted':
      return 'Overcommitted';
    case 'destination-overcovered':
      return 'Overcovered';
  }
}

function warningLabel(health: PlannerSessionLinkHealth): string | null {
  if (health.link.paused === true) {
    return 'Paused links do not count toward coverage.';
  }
  if (health.issues.length === 0) {
    return null;
  }
  return health.issues.map(statusLabel).join(', ');
}

function linkHealthHasMissingReference(health: PlannerSessionLinkHealth): boolean {
  return health.issues.includes('missing-source') || health.issues.includes('missing-destination');
}
