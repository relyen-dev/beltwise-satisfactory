import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import { buildResourceCapsPerMinute, createPlannerProject } from '@beltwise/planner-core';

describe('buildResourceCapsPerMinute', () => {
  it('uses generated baseline resource limits for new projects', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z'
    });

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)).toMatchObject({
      Desc_OreCopper_C: 300,
      Desc_OreIron_C: 600
    });
  });

  it('treats disabled resources as unavailable without hard-coded solver limits', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z'
    });

    project.resourceOverrides['Desc_OreIron_C'] = {
      enabled: false,
      maxPerMinute: 600
    };

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)['Desc_OreIron_C']).toBe(0);

    delete project.resourceOverrides['Desc_OreIron_C'];

    expect(buildResourceCapsPerMinute(tinySatisfactoryDataset, project)['Desc_OreIron_C']).toBe(600);
  });
});
