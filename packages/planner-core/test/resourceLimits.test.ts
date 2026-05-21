import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import { buildResourceCapsPerMinute, createPlannerProject } from '@beltwise/planner-core';

describe('buildResourceCapsPerMinute', () => {
  it('uses generated baseline resource limits for new projects', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)).toMatchObject({
      Desc_OreCopper_C: 300,
      Desc_OreIron_C: 600,
    });
  });

  it('treats disabled resources as unavailable without hard-coded solver limits', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    project.resourceOverrides['Desc_OreIron_C'] = {
      enabled: false,
      maxPerMinute: 600,
    };

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)['Desc_OreIron_C']).toBe(0);

    delete project.resourceOverrides['Desc_OreIron_C'];

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)['Desc_OreIron_C']).toBe(
      600,
    );
  });

  it('treats zero caps on unlimited resources as unlimited unless the resource is disabled', () => {
    const dataset = withUnlimitedWaterDataset();
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    project.resourceOverrides['Desc_Water_C'] = { maxPerMinute: 0 };
    project.resourceOverrides['Desc_OreIron_C'] = { maxPerMinute: 0 };

    expect(buildResourceCapsPerMinute(dataset, project)).toMatchObject({
      Desc_Water_C: Number.MAX_SAFE_INTEGER,
      Desc_OreIron_C: 0,
    });

    project.resourceOverrides['Desc_Water_C'] = { enabled: false, maxPerMinute: 0 };

    expect(buildResourceCapsPerMinute(dataset, project)['Desc_Water_C']).toBe(0);
  });
});

function withUnlimitedWaterDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Water_C: {
        id: 'Desc_Water_C',
        className: 'Desc_Water_C',
        displayName: 'Water',
        form: 'liquid',
      },
    },
    resources: {
      ...tinySatisfactoryDataset.resources,
      Desc_Water_C: {
        itemId: 'Desc_Water_C',
        displayName: 'Water',
        extraction: {
          allowedExtractors: ['Build_WaterPump_C'],
          baselineMaxPerMinute: Number.MAX_SAFE_INTEGER,
        },
      },
    },
  };
}
