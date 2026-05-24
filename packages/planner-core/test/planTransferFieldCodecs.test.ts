import { describe, expect, it } from 'vitest';
import {
  booleanOverrideEntriesForTransfer,
  copyGraphNodeBuildStatesForTransfer,
  copyProductTargetForTransfer,
  copySinkRulesForTransfer,
  createDefaultGraphDisplaySettings,
  readBooleanOverridesForTransfer,
  readBuildStateForTransfer,
  readGraphDisplaySettingsForTransfer,
  readGraphLayoutForTransfer,
  readItemInputsForTransfer,
  readNumberRecordForTransfer,
  readProductTargetsForTransfer,
  readResourceOverridesForTransfer,
  readSinkRulesForTransfer,
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
        {
          id: '__proto__',
          itemId: 'Desc_Screw_C',
          mode: 'fixed',
          amountPerMinute: 5,
          sortOrder: 5,
        },
        {
          id: 'toString',
          itemId: 'Desc_Wire_C',
          mode: 'fixed',
          amountPerMinute: 2,
          sortOrder: 6,
        },
        { id: 'unsafe-item', itemId: '__proto__', mode: 'fixed', amountPerMinute: 1, sortOrder: 6 },
        {
          id: 'unsafe-inherited-item',
          itemId: 'hasOwnProperty',
          mode: 'fixed',
          amountPerMinute: 1,
          sortOrder: 7,
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
      {
        id: 'target-generated-2',
        itemId: 'Desc_Screw_C',
        mode: 'fixed',
        amountPerMinute: 5,
        sortOrder: 5,
      },
      {
        id: 'target-generated-3',
        itemId: 'Desc_Wire_C',
        mode: 'fixed',
        amountPerMinute: 2,
        sortOrder: 6,
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

  it('reads surplus sink rules permissively and normalizes duplicate items', () => {
    let nextId = 0;
    const sinkRules = readSinkRulesForTransfer(
      [
        {
          itemId: 'Desc_Screw_C',
          mode: 'surplus',
          sortOrder: 3,
        },
        {
          id: 'sink-wire',
          itemId: 'Desc_Wire_C',
          mode: 'surplus',
          sortOrder: 1,
        },
        {
          id: 'sink-duplicate',
          itemId: 'Desc_Wire_C',
          mode: 'surplus',
          sortOrder: 2,
        },
        {
          id: '__proto__',
          itemId: 'Desc_IronPlate_C',
          mode: 'surplus',
          sortOrder: 4,
        },
        {
          id: 'bad-mode',
          itemId: 'Desc_IronRod_C',
          mode: 'fixed',
          sortOrder: 5,
        },
        {
          id: 'unsafe-item',
          itemId: 'hasOwnProperty',
          mode: 'surplus',
          sortOrder: 6,
        },
        {
          id: 'draft-item',
          itemId: '',
          mode: 'surplus',
          sortOrder: 7,
        },
      ],
      () => `sink-generated-${++nextId}`,
    );

    expect(sinkRules).toEqual([
      {
        id: 'sink-wire',
        itemId: 'Desc_Wire_C',
        mode: 'surplus',
        sortOrder: 0,
      },
      {
        id: 'sink-generated-1',
        itemId: 'Desc_Screw_C',
        mode: 'surplus',
        sortOrder: 1,
      },
      {
        id: 'sink-generated-2',
        itemId: 'Desc_IronPlate_C',
        mode: 'surplus',
        sortOrder: 2,
      },
    ]);
    expect(copySinkRulesForTransfer(sinkRules)).toEqual(sinkRules);
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

  it('drops unsafe record keys from untrusted transfer maps', () => {
    const pollutedRecord = JSON.parse(
      '{"__proto__":{"enabled":false},"constructor":{"enabled":false},' +
        '"prototype":{"enabled":false},"toString":{"enabled":false},' +
        '"hasOwnProperty":{"enabled":false},"Recipe_IronPlate_C":{"enabled":true}}',
    ) as unknown;

    expect(readBooleanOverridesForTransfer(pollutedRecord)).toEqual({
      Recipe_IronPlate_C: { enabled: true },
    });
    expect(
      readResourceOverridesForTransfer(
        JSON.parse(
          '{"__proto__":{"enabled":false,"maxPerMinute":1},' +
            '"hasOwnProperty":{"enabled":false,"maxPerMinute":1}}',
        ) as unknown,
      ),
    ).toEqual({});
    expect(
      readItemInputsForTransfer(
        JSON.parse(
          '{"__proto__":{"amountPerMinute":1},"toString":{"amountPerMinute":1}}',
        ) as unknown,
      ),
    ).toEqual({});
    expect(
      readNumberRecordForTransfer(
        JSON.parse('{"__proto__":3,"hasOwnProperty":4,"Desc_OreIron_C":2}') as unknown,
      ),
    ).toEqual({ Desc_OreIron_C: 2 });
    expect(
      readGraphLayoutForTransfer(
        JSON.parse(
          '{"nodePositions":{"__proto__":{"x":1,"y":2},"constructor":{"x":3,"y":4},' +
            '"toString":{"x":7,"y":8},"recipe:Recipe_IronPlate_C":{"x":5,"y":6}}}',
        ) as unknown,
      ),
    ).toEqual({
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 5, y: 6 },
      },
    });
    expect(
      readBuildStateForTransfer(
        JSON.parse(
          '{"nodeStates":{"__proto__":{"done":true,"note":"polluted"},' +
            '"constructor":{"done":true},"hasOwnProperty":{"done":true},' +
            '"recipe:Recipe_IronPlate_C":{"note":"Floor 2"}}}',
        ) as unknown,
      ),
    ).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': { note: 'Floor 2' },
      },
    });
  });
});
