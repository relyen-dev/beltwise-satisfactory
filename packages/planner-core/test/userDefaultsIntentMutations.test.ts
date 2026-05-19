import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  resetAllDefaultResources,
  resetDefaultResource,
  resetUserDefaultsToBuiltIns,
  saveProjectSettingsAsDefaults,
  setAllDefaultResourcesEnabled,
  setDefaultGraphEdgeStyle,
  setDefaultMachineEnabled,
  setDefaultObjectivePreset,
  setDefaultObjectiveWeight,
  setDefaultRateDecimalPlaces,
  setDefaultRecipeEnabled,
  setDefaultRecipesEnabled,
  setDefaultResourceCap,
  setDefaultResourceEnabled,
} from '@beltwise/planner-core';

const NOW = '2026-05-12T00:00:00.000Z';

describe('user defaults intent mutations', () => {
  it('updates default recipe and machine availability', () => {
    const defaults = createDefaults();

    const recipesChanged = setDefaultRecipesEnabled(
      setDefaultRecipeEnabled(defaults, 'Recipe_IronPlate_C', false),
      ['Recipe_IronWire_C'],
      true,
    );
    const machinesChanged = setDefaultMachineEnabled(
      recipesChanged,
      'Build_ConstructorMk1_C',
      false,
    );

    expect(machinesChanged.recipeOverrides['Recipe_IronPlate_C']).toEqual({ enabled: false });
    expect(machinesChanged.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(machinesChanged.machineOverrides['Build_ConstructorMk1_C']).toEqual({
      enabled: false,
    });
  });

  it('normalizes default resource overrides against the dataset baseline', () => {
    const defaults = createDefaults();
    const baselineCapPerMinute = 600;

    expect(
      setDefaultResourceCap(
        defaults,
        'Desc_OreIron_C',
        baselineCapPerMinute,
        baselineCapPerMinute,
      ).resourceOverrides,
    ).toEqual({});

    const disabled = setDefaultResourceEnabled(
      defaults,
      'Desc_OreIron_C',
      false,
      baselineCapPerMinute,
    );
    expect(disabled.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: baselineCapPerMinute,
    });

    const customDisabled = setDefaultResourceCap(
      disabled,
      'Desc_OreIron_C',
      120,
      baselineCapPerMinute,
    );
    expect(customDisabled.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: 120,
    });

    expect(
      setDefaultResourceEnabled(
        customDisabled,
        'Desc_OreIron_C',
        true,
        baselineCapPerMinute,
      ).resourceOverrides['Desc_OreIron_C'],
    ).toEqual({ maxPerMinute: 120 });

    expect(resetDefaultResource(customDisabled, 'Desc_OreIron_C').resourceOverrides).toEqual({});
  });

  it('can disable and reset all default resources', () => {
    const defaults = createDefaults();
    const disabled = setAllDefaultResourcesEnabled(
      defaults,
      Object.values(tinySatisfactoryDataset.resources),
      false,
    );

    expect(Object.values(disabled.resourceOverrides).every((override) => override.enabled === false))
      .toBe(true);
    expect(
      resetAllDefaultResources(disabled, Object.keys(tinySatisfactoryDataset.resources))
        .resourceOverrides,
    ).toEqual({});
  });

  it('updates default objective settings and graph display settings', () => {
    const defaults = createDefaults();

    const lowPower = setDefaultObjectivePreset(defaults, 'low-power');
    const custom = setDefaultObjectiveWeight(lowPower, 'powerWeight', 2);
    const display = setDefaultGraphEdgeStyle(setDefaultRateDecimalPlaces(custom, 4), 'curved');

    expect(lowPower.objectiveProfile.presetId).toBe('low-power');
    expect(custom.objectiveProfile.presetId).toBe('custom');
    expect(custom.objectiveProfile.powerWeight).toBe(2);
    expect(display.graphDisplay.rateDecimalPlaces).toBe(4);
    expect(display.graphDisplay.edgeStyle).toBe('curved');
  });

  it('copies only default-eligible project settings and resets to built-ins', () => {
    const project = {
      ...createPlannerProject({
        id: 'project-a',
        name: 'Factory',
        dataset: tinySatisfactoryDataset,
        now: NOW,
        targets: [
          {
            id: 'target-a',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed' as const,
            amountPerMinute: 20,
            sortOrder: 0,
          },
        ],
      }),
      recipeOverrides: { Recipe_IronWire_C: { enabled: true } },
      machineOverrides: { Build_ConstructorMk1_C: { enabled: false } },
      resourceOverrides: { Desc_OreIron_C: { maxPerMinute: 120 } },
      graphDisplay: {
        ...createDefaults().graphDisplay,
        edgeStyle: 'curved' as const,
      },
    };

    const saved = saveProjectSettingsAsDefaults(project);
    const reset = resetUserDefaultsToBuiltIns(tinySatisfactoryDataset);

    expect(saved.recipeOverrides).toEqual(project.recipeOverrides);
    expect(saved.machineOverrides).toEqual(project.machineOverrides);
    expect(saved.resourceOverrides).toEqual(project.resourceOverrides);
    expect(saved.graphDisplay.edgeStyle).toBe('curved');
    expect(reset).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
  });
});

function createDefaults() {
  return createDefaultUserDefaults(tinySatisfactoryDataset);
}
