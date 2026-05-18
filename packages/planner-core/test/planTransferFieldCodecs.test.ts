import { describe, expect, it } from 'vitest';
import {
  booleanOverrideEntriesForTransfer,
  copyGraphNodeBuildStatesForTransfer,
  copyProductTargetForTransfer,
  createDefaultGraphDisplaySettings,
  readBuildStateForTransfer,
  readGraphDisplaySettingsForTransfer,
  readItemInputsForTransfer,
  readProductTargetsForTransfer,
  readResourceOverridesForTransfer,
  readTransferObjectiveStageOrder,
  resourceOverrideEntriesForTransfer,
} from '@beltwise/planner-core';

describe('plan transfer field codecs', () => {
  it('reads persisted product targets permissively and preserves authored target fields', () => {
    let nextId = 0;
    const targets = readProductTargetsForTransfer(
      [
        {
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: -5,
          sortOrder: 3,
        },
        {
          id: 'target-max',
          itemId: 'Desc_Wire_C',
          mode: 'maximize',
          amountPerMinute: 999,
          sortOrder: 4,
        },
        { id: 'bad-mode', itemId: 'Desc_Wire_C', mode: 'unknown', sortOrder: 5 },
      ],
      () => `target-generated-${++nextId}`,
    );

    expect(targets).toEqual([
      {
        id: 'target-generated-1',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 0,
        sortOrder: 3,
      },
      {
        id: 'target-max',
        itemId: 'Desc_Wire_C',
        mode: 'maximize',
        sortOrder: 4,
      },
    ]);

    const maximizeTarget = targets[1];
    if (maximizeTarget === undefined) {
      throw new Error('Expected maximize target');
    }
    const copied = copyProductTargetForTransfer(maximizeTarget);

    expect(copied).toEqual({
      id: 'target-max',
      itemId: 'Desc_Wire_C',
      mode: 'maximize',
      sortOrder: 4,
    });
  });

  it('normalizes override fields for record and compact transfer shapes', () => {
    expect(
      booleanOverrideEntriesForTransfer(
        {
          Recipe_Default_C: { enabled: false },
          Recipe_Custom_C: { enabled: true },
        },
        {
          Recipe_Default_C: { enabled: false },
        },
        false,
      ),
    ).toEqual([{ id: 'Recipe_Custom_C', enabled: true }]);

    expect(
      resourceOverrideEntriesForTransfer(
        {
          Desc_OreIron_C: { enabled: true },
          Desc_OreCopper_C: { enabled: false, maxPerMinute: 60 },
        },
        { omitEnabledWhenTrue: true },
      ),
    ).toEqual([{ id: 'Desc_OreCopper_C', enabled: false, maxPerMinute: 60 }]);

    expect(
      readResourceOverridesForTransfer({
        Desc_OreIron_C: { maxPerMinute: -10 },
        Desc_OreCopper_C: { maxPerMinute: 'fast' },
      }),
    ).toEqual({
      Desc_OreIron_C: { maxPerMinute: 0 },
    });

    expect(
      readItemInputsForTransfer({
        Desc_IngotIron_C: { amountPerMinute: -15 },
        Desc_Wire_C: { amountPerMinute: Number.POSITIVE_INFINITY },
      }),
    ).toEqual({
      Desc_IngotIron_C: { amountPerMinute: 0 },
    });
  });

  it('hydrates display, build-state, and objective helper fields with backward compatibility', () => {
    const display = readGraphDisplaySettingsForTransfer(
      {
        maxBeltTier: 4,
        maxPipeTier: 9,
        rateDecimalPlaces: 2,
        edgeStyle: 'curved',
        showTransportLabels: false,
      },
      createDefaultGraphDisplaySettings(),
    );

    expect(display).toEqual({
      maxBeltTier: 4,
      maxPipeTier: 2,
      rateDecimalPlaces: 2,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: true,
    });

    expect(
      readBuildStateForTransfer({
        locked: true,
        nodeLayoutLocked: true,
        nodeStates: {
          'recipe:Recipe_IronPlate_C': { done: false, note: '   ' },
          'recipe:Recipe_Wire_C': { note: 'Floor 2' },
        },
      }),
    ).toEqual({
      planLocked: true,
      nodeLayoutLocked: true,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': { done: false },
        'recipe:Recipe_Wire_C': { note: 'Floor 2' },
      },
    });

    expect(
      copyGraphNodeBuildStatesForTransfer({
        a: {},
        b: { done: true, note: '' },
        c: { done: false, note: 'Check belt' },
      }),
    ).toEqual({
      b: { done: true },
      c: { done: false, note: 'Check belt' },
    });

    expect(readTransferObjectiveStageOrder(['power', 'power', 'surplus'])).toEqual([
      'power',
      'surplus',
    ]);
    expect(readTransferObjectiveStageOrder(['power', 'bad-stage'])).toBeUndefined();
  });
});
