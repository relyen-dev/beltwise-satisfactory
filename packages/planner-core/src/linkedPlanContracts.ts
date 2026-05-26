import type { ItemId } from '@beltwise/game-data';
import type { PlannerProject, PlannerSession, PlannerSessionLink } from './plan';
import type { ProductionPlanResult } from './graphModel';
import { targetOutputAmountForTarget } from './targetOutputSinks';

export type PlannerSessionLinkHealthStatus =
  | 'healthy'
  | 'missing-source'
  | 'missing-destination'
  | 'source-short'
  | 'source-overcommitted'
  | 'destination-overcovered';

export type PlannerSessionLinkHealthIssue = Exclude<PlannerSessionLinkHealthStatus, 'healthy'>;

export interface PlannerSessionLinkHealth {
  readonly link: PlannerSessionLink;
  readonly status: PlannerSessionLinkHealthStatus;
  readonly issues: readonly PlannerSessionLinkHealthIssue[];
  readonly sourceAvailableAmountPerMinute?: number;
  readonly sourceCommittedAmountPerMinute?: number;
  readonly destinationRequiredAmountPerMinute?: number;
  readonly destinationCoveredAmountPerMinute?: number;
}

export interface PlannerSessionLinkHealthOptions {
  readonly session: PlannerSession;
  readonly projects: readonly PlannerProject[];
  readonly solveResultsByProjectId?: Readonly<
    Record<string, ProductionPlanResult | null | undefined>
  >;
}

const LINK_RATE_EPSILON = 0.000001;

export function selectPlannerSessionLinkHealth(
  options: PlannerSessionLinkHealthOptions,
): PlannerSessionLinkHealth[] {
  const projectsById = new Map(options.projects.map((project) => [project.id, project]));
  const links = options.session.links ?? [];
  const activeLinks = links.filter(
    (link) => link.paused !== true && linkHasCurrentReferences(link, projectsById),
  );
  const sourceCommittedAmounts = sumActiveLinkAmounts(activeLinks, sourceKeyForLink);
  const destinationCoveredAmounts = sumActiveLinkAmounts(activeLinks, destinationKeyForLink);

  return links.map((link) =>
    selectPlannerSessionLinkHealthForLink({
      link,
      projectsById,
      sourceCommittedAmounts,
      destinationCoveredAmounts,
      ...(options.solveResultsByProjectId !== undefined
        ? { solveResultsByProjectId: options.solveResultsByProjectId }
        : {}),
    }),
  );
}

function selectPlannerSessionLinkHealthForLink(options: {
  readonly link: PlannerSessionLink;
  readonly projectsById: ReadonlyMap<string, PlannerProject>;
  readonly solveResultsByProjectId?: Readonly<
    Record<string, ProductionPlanResult | null | undefined>
  >;
  readonly sourceCommittedAmounts: ReadonlyMap<string, number>;
  readonly destinationCoveredAmounts: ReadonlyMap<string, number>;
}): PlannerSessionLinkHealth {
  const sourceProject = options.projectsById.get(options.link.source.projectId);
  const sourceTarget = sourceProject?.targets.find(
    (target) => target.id === options.link.source.targetId,
  );
  const destinationProject = options.projectsById.get(options.link.destination.projectId);
  const destinationInput = destinationProject?.itemInputs[options.link.destination.itemId];
  const issues: PlannerSessionLinkHealthIssue[] = [];

  if (!sourceProject || !sourceTarget || sourceTarget.itemId !== options.link.itemId) {
    issues.push('missing-source');
  }
  if (
    !destinationProject ||
    options.link.destination.itemId !== options.link.itemId ||
    destinationInput === undefined
  ) {
    issues.push('missing-destination');
  }

  if (
    issues.length > 0 ||
    options.link.paused === true ||
    !sourceProject ||
    !sourceTarget ||
    destinationInput === undefined
  ) {
    return {
      link: options.link,
      status: firstLinkStatus(issues),
      issues,
    };
  }

  const sourceAvailableAmountPerMinute = sourceAvailableAmountForLink(
    sourceProject,
    sourceTarget.id,
    options.solveResultsByProjectId?.[sourceProject.id] ?? null,
  );
  const sourceCommittedAmountPerMinute =
    options.sourceCommittedAmounts.get(sourceKeyForLink(options.link)) ?? 0;
  const destinationRequiredAmountPerMinute = destinationInput.amountPerMinute;
  const destinationCoveredAmountPerMinute =
    options.destinationCoveredAmounts.get(destinationKeyForLink(options.link)) ?? 0;

  if (options.link.amountPerMinute > sourceAvailableAmountPerMinute + LINK_RATE_EPSILON) {
    issues.push('source-short');
  }
  if (sourceCommittedAmountPerMinute > sourceAvailableAmountPerMinute + LINK_RATE_EPSILON) {
    issues.push('source-overcommitted');
  }
  if (destinationCoveredAmountPerMinute > destinationRequiredAmountPerMinute + LINK_RATE_EPSILON) {
    issues.push('destination-overcovered');
  }

  return {
    link: options.link,
    status: firstLinkStatus(issues),
    issues,
    sourceAvailableAmountPerMinute,
    sourceCommittedAmountPerMinute,
    destinationRequiredAmountPerMinute,
    destinationCoveredAmountPerMinute,
  };
}

function linkHasCurrentReferences(
  link: PlannerSessionLink,
  projectsById: ReadonlyMap<string, PlannerProject>,
): boolean {
  const sourceProject = projectsById.get(link.source.projectId);
  const sourceTarget = sourceProject?.targets.find((target) => target.id === link.source.targetId);
  const destinationProject = projectsById.get(link.destination.projectId);
  const destinationInput = destinationProject?.itemInputs[link.destination.itemId];
  return (
    sourceTarget !== undefined &&
    sourceTarget.itemId === link.itemId &&
    destinationInput !== undefined &&
    link.destination.itemId === link.itemId
  );
}

function sourceAvailableAmountForLink(
  sourceProject: PlannerProject,
  targetId: string,
  solveResult: ProductionPlanResult | null,
): number {
  const target = sourceProject.targets.find((candidate) => candidate.id === targetId);
  if (!target) {
    return 0;
  }
  const usableSolveResult = solveResult?.status === 'optimal' ? solveResult : null;
  return targetOutputAmountForTarget(target, usableSolveResult, sourceProject.targets);
}

function sumActiveLinkAmounts(
  links: readonly PlannerSessionLink[],
  keyForLink: (link: PlannerSessionLink) => string,
): ReadonlyMap<string, number> {
  const amounts = new Map<string, number>();
  for (const link of links) {
    amounts.set(keyForLink(link), (amounts.get(keyForLink(link)) ?? 0) + link.amountPerMinute);
  }
  return amounts;
}

function firstLinkStatus(
  issues: readonly PlannerSessionLinkHealthIssue[],
): PlannerSessionLinkHealthStatus {
  return issues[0] ?? 'healthy';
}

function sourceKeyForLink(link: PlannerSessionLink): string {
  return sourceKey(link.source.projectId, link.source.targetId);
}

function destinationKeyForLink(link: PlannerSessionLink): string {
  return destinationKey(link.destination.projectId, link.destination.itemId);
}

function sourceKey(projectId: string, targetId: string): string {
  return `${projectId}\u0000${targetId}`;
}

function destinationKey(projectId: string, itemId: ItemId): string {
  return `${projectId}\u0000${itemId}`;
}
