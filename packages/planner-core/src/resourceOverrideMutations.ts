import type { ItemId, ResourceInfo } from '@beltwise/game-data';
import type { ResourceOverride } from './plan';

export function defaultResourceCapPerMinute(resource: ResourceInfo): number | undefined {
  return resource.extraction?.baselineMaxPerMinute;
}

export function resourceCapsEqual(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    Math.abs(left - right) < 0.000001 ||
    (isUnlimitedResourceCap(left) && isUnlimitedResourceCap(right))
  );
}

export function isUnlimitedResourceCap(capPerMinute: number | undefined): boolean {
  return capPerMinute === undefined || capPerMinute >= 1_000_000_000;
}

export function normalizeResourceOverride(
  override: ResourceOverride,
  baselineCapPerMinute: number | undefined,
): ResourceOverride | undefined {
  const enabled = override.enabled ?? true;
  const maxPerMinute = normalizeOverrideCap(override.maxPerMinute, baselineCapPerMinute);
  if (
    enabled &&
    (maxPerMinute === undefined || resourceCapsEqual(maxPerMinute, baselineCapPerMinute))
  ) {
    return undefined;
  }
  if (maxPerMinute === override.maxPerMinute) {
    return override;
  }
  return {
    ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
    ...(maxPerMinute !== undefined ? { maxPerMinute } : {}),
  };
}

export function normalizeResourceOverrides(
  overrides: Record<ItemId, ResourceOverride>,
  resources: Readonly<Record<ItemId, ResourceInfo>>,
): Record<ItemId, ResourceOverride> {
  const normalizedOverrides: Record<ItemId, ResourceOverride> = {};
  for (const [itemId, override] of Object.entries(overrides)) {
    const resource = resources[itemId];
    const normalizedOverride =
      resource === undefined
        ? override
        : normalizeResourceOverride(override, defaultResourceCapPerMinute(resource));
    if (normalizedOverride !== undefined) {
      normalizedOverrides[itemId] = normalizedOverride;
    }
  }
  return normalizedOverrides;
}

export function setResourceOverrideCap(
  overrides: Record<ItemId, ResourceOverride>,
  itemId: ItemId,
  maxPerMinute: number,
  baselineCapPerMinute: number | undefined,
): Record<ItemId, ResourceOverride> {
  const safeMaxPerMinute = Math.max(0, Number.isFinite(maxPerMinute) ? maxPerMinute : 0);
  const currentOverride = overrides[itemId];
  const nextOverride = normalizeResourceOverride(
    {
      ...(currentOverride?.enabled === false ? { enabled: false } : {}),
      maxPerMinute: safeMaxPerMinute,
    },
    baselineCapPerMinute,
  );

  return withOptionalOverride(overrides, itemId, nextOverride);
}

export function setResourceOverrideEnabled(
  overrides: Record<ItemId, ResourceOverride>,
  itemId: ItemId,
  enabled: boolean,
  baselineCapPerMinute: number | undefined,
): Record<ItemId, ResourceOverride> {
  const currentOverride = overrides[itemId];
  const currentCapPerMinute = currentOverride?.maxPerMinute ?? baselineCapPerMinute;
  const nextOverride = enabled
    ? normalizeResourceOverride(
        {
          ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
        },
        baselineCapPerMinute,
      )
    : {
        enabled: false,
        ...(currentCapPerMinute !== undefined ? { maxPerMinute: currentCapPerMinute } : {}),
      };

  return withOptionalOverride(overrides, itemId, nextOverride);
}

export function resetResourceOverride(
  overrides: Record<ItemId, ResourceOverride>,
  itemId: ItemId,
): Record<ItemId, ResourceOverride> {
  return withoutOverride(overrides, itemId);
}

export function resetResourceOverrides(
  overrides: Record<ItemId, ResourceOverride>,
  resourceIds: readonly ItemId[],
): Record<ItemId, ResourceOverride> {
  let nextOverrides = overrides;
  for (const itemId of resourceIds) {
    nextOverrides = withoutOverride(nextOverrides, itemId);
  }
  return nextOverrides;
}

export function setAllResourceOverridesEnabled(
  overrides: Record<ItemId, ResourceOverride>,
  resources: readonly ResourceInfo[],
  enabled: boolean,
): Record<ItemId, ResourceOverride> {
  let nextOverrides = { ...overrides };
  for (const resource of resources) {
    const baselineCapPerMinute = defaultResourceCapPerMinute(resource);
    nextOverrides = setResourceOverrideEnabled(
      nextOverrides,
      resource.itemId,
      enabled,
      baselineCapPerMinute,
    );
  }
  return nextOverrides;
}

function withOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
  override: TOverride,
): Record<string, TOverride> {
  return {
    ...overrides,
    [id]: override,
  };
}

function normalizeOverrideCap(
  maxPerMinute: number | undefined,
  baselineCapPerMinute: number | undefined,
): number | undefined {
  return maxPerMinute === 0 && isUnlimitedResourceCap(baselineCapPerMinute)
    ? undefined
    : maxPerMinute;
}

function withOptionalOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
  override: TOverride | undefined,
): Record<string, TOverride> {
  if (override === undefined) {
    return withoutOverride(overrides, id);
  }
  return withOverride(overrides, id, override);
}

function withoutOverride<TOverride>(
  overrides: Record<string, TOverride>,
  id: string,
): Record<string, TOverride> {
  const next = { ...overrides };
  delete next[id];
  return next;
}
