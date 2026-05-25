import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import type { Item, ItemId } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { SinkRuleRow, TargetOutputSinkOption } from '../state/planner-store.selectors';
import { PlannerSinksSectionComponent } from './planner-sinks-section.component';

describe('PlannerSinksSectionComponent', () => {
  it('adds surplus sink rules through the plan-config command', () => {
    const { addSurplusCalls, component } = createComponentHarness({
      availableSurplusSinkItems: [screwItem],
    });

    component.addSurplusSink('Desc_Screw_C');

    expect(addSurplusCalls).toEqual(['Desc_Screw_C']);
  });

  it('keeps add-from-menu disabled while editing is locked', () => {
    const { addSurplusCalls, component, planConfig } = createComponentHarness({
      availableSurplusSinkItems: [screwItem],
    });

    planConfig.editingLocked.set(true);
    component.addSurplusSink('Desc_Screw_C');

    expect(addSurplusCalls).toEqual([]);
  });

  it('uses compact picker labels for available and exhausted sink lists', () => {
    const { component, planConfig } = createComponentHarness();

    expect(component.addPickerLabel()).toBe('No sinkable surplus');

    planConfig.availableSurplusSinkItems.set([screwItem]);

    expect(component.addPickerLabel()).toBe('Add surplus sink');
  });

  it('adds and updates target output sink rules through the plan-config command', () => {
    const { addTargetOutputCalls, component } = createComponentHarness({
      availableTargetOutputSinkOptions: [
        {
          item: screwItem,
          itemId: 'Desc_Screw_C',
          displayName: 'Screw',
          iconSrc: '/game-icons/Desc_Screw_C.png',
          targetOutputAmountPerMinute: 100,
          configuredAmountPerMinute: 20,
          remainingAmountPerMinute: 80,
        },
      ],
    });

    component.selectTargetOutputSinkItem('Desc_Screw_C');
    component.setTargetOutputAmountInput('120');
    component.addTargetOutputSink();

    expect(addTargetOutputCalls).toEqual([{ itemId: 'Desc_Screw_C', amountPerMinute: 80 }]);
  });

  it('keeps target output add amount drafts raw while editing and formats on blur', () => {
    const { component } = createComponentHarness({
      availableTargetOutputSinkOptions: [
        {
          item: screwItem,
          itemId: 'Desc_Screw_C',
          displayName: 'Screw',
          iconSrc: '/game-icons/Desc_Screw_C.png',
          targetOutputAmountPerMinute: 100,
          configuredAmountPerMinute: 0,
          remainingAmountPerMinute: 80,
        },
      ],
    });

    component.selectTargetOutputSinkItem('Desc_Screw_C');

    component.setTargetOutputAmountInput('.');
    expect(component.targetOutputAmountPerMinute).toBe('.');
    expect(component.canAddTargetOutputSink()).toBe(false);

    component.setTargetOutputAmountInput('1.');
    expect(component.targetOutputAmountPerMinute).toBe('1.');
    expect(component.canAddTargetOutputSink()).toBe(true);

    component.setTargetOutputAmountInput('.5');
    expect(component.targetOutputAmountPerMinute).toBe('.5');
    component.finishTargetOutputAmountInput();
    expect(component.targetOutputAmountPerMinute).toBe('0.5');

    component.setTargetOutputAmountInput('14.9999999');
    component.finishTargetOutputAmountInput();
    expect(component.targetOutputAmountPerMinute).toBe('15');
  });

  it('formats target output sink amount inputs and ignores transient empty edits', () => {
    const row = targetOutputSinkRow({
      amountPerMinute: 14.9999999,
      configuredAmountPerMinute: 14.9999999,
      maxAmountPerMinute: 40,
    });
    const { component, planConfig, updateTargetOutputCalls } = createComponentHarness();
    planConfig.sinkRuleRows.set([row]);

    expect(component.targetOutputSinkAmountInputValue(row)).toBe('15');

    component.updateTargetOutputSinkAmount(row, null);

    expect(updateTargetOutputCalls).toEqual([]);
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('');

    component.finishTargetOutputSinkAmountEdit(row);
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('15');

    component.updateTargetOutputSinkAmount(row, 39.9999999);

    expect(updateTargetOutputCalls).toEqual([
      { sinkRuleId: 'sink-target-screw', amountPerMinute: 40 },
    ]);
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('39.9999999');

    const updatedRow = targetOutputSinkRow({
      amountPerMinute: 40,
      configuredAmountPerMinute: 40,
      maxAmountPerMinute: 40,
    });
    planConfig.sinkRuleRows.set([updatedRow]);
    component.finishTargetOutputSinkAmountEdit(row);
    expect(component.targetOutputSinkAmountInputValue(updatedRow)).toBe('40');
  });

  it('keeps target output row amount drafts raw while editing decimals', () => {
    const row = targetOutputSinkRow({ maxAmountPerMinute: 40 });
    const { component, updateTargetOutputCalls } = createComponentHarness();

    component.updateTargetOutputSinkAmount(row, '1.');
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('1.');

    component.updateTargetOutputSinkAmount(row, '.');
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('.');

    component.updateTargetOutputSinkAmount(row, '.5');
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('.5');

    component.updateTargetOutputSinkAmount(row, '1.5');
    expect(component.targetOutputSinkAmountInputValue(row)).toBe('1.5');
    expect(updateTargetOutputCalls).toEqual([
      { sinkRuleId: 'sink-target-screw', amountPerMinute: 1 },
      { sinkRuleId: 'sink-target-screw', amountPerMinute: 0.5 },
      { sinkRuleId: 'sink-target-screw', amountPerMinute: 1.5 },
    ]);
  });
});

function createComponentHarness(
  options: {
    availableSurplusSinkItems?: readonly Item[];
    availableTargetOutputSinkOptions?: readonly TargetOutputSinkOption[];
  } = {},
): {
  addSurplusCalls: ItemId[];
  addTargetOutputCalls: { itemId: ItemId; amountPerMinute: number }[];
  updateTargetOutputCalls: { sinkRuleId: string; amountPerMinute: number }[];
  component: PlannerSinksSectionComponent;
  planConfig: PlannerSinksPlanConfigHarness;
} {
  const addSurplusCalls: ItemId[] = [];
  const addTargetOutputCalls: { itemId: ItemId; amountPerMinute: number }[] = [];
  const updateTargetOutputCalls: { sinkRuleId: string; amountPerMinute: number }[] = [];
  const planConfig: PlannerSinksPlanConfigHarness = {
    editingLocked: signal(false),
    availableSurplusSinkItems: signal<Item[]>([...(options.availableSurplusSinkItems ?? [])]),
    availableTargetOutputSinkOptions: signal<TargetOutputSinkOption[]>([
      ...(options.availableTargetOutputSinkOptions ?? []),
    ]),
    sinkRuleRows: signal<SinkRuleRow[]>([]),
    sinkCommands: {
      addSurplus: (itemId) => addSurplusCalls.push(itemId),
      addTargetOutput: (itemId, amountPerMinute) =>
        addTargetOutputCalls.push({ itemId, amountPerMinute }),
      updateTargetOutputAmount: (sinkRuleId, amountPerMinute) =>
        updateTargetOutputCalls.push({ sinkRuleId, amountPerMinute }),
      remove: () => undefined,
      removeSurplusForItem: () => undefined,
      toggleSurplus: () => undefined,
    },
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerPlanConfigStore, useValue: planConfig }],
  });
  const component = runInInjectionContext(injector, () => new PlannerSinksSectionComponent());

  return { addSurplusCalls, addTargetOutputCalls, updateTargetOutputCalls, component, planConfig };
}

interface PlannerSinksPlanConfigHarness {
  editingLocked: WritableSignal<boolean>;
  availableSurplusSinkItems: WritableSignal<Item[]>;
  availableTargetOutputSinkOptions: WritableSignal<TargetOutputSinkOption[]>;
  sinkRuleRows: WritableSignal<SinkRuleRow[]>;
  sinkCommands: {
    addSurplus: (itemId: ItemId) => void;
    addTargetOutput: (itemId: ItemId, amountPerMinute: number) => void;
    updateTargetOutputAmount: (sinkRuleId: string, amountPerMinute: number) => void;
    remove: (sinkRuleId: string) => void;
    removeSurplusForItem: (itemId: ItemId) => void;
    toggleSurplus: (itemId: ItemId) => void;
  };
}

const screwItem: Item = {
  id: 'Desc_Screw_C',
  className: 'Desc_Screw_C',
  displayName: 'Screw',
  form: 'solid',
  sinkPoints: 2,
};

function targetOutputSinkRow(patch: Partial<SinkRuleRow> = {}): SinkRuleRow {
  return {
    rule: {
      id: 'sink-target-screw',
      itemId: 'Desc_Screw_C',
      mode: 'target-output',
      amountPerMinute: 20,
      sortOrder: 0,
    },
    itemId: 'Desc_Screw_C',
    displayName: 'Screw',
    iconSrc: '/game-icons/Desc_Screw_C.png',
    mode: 'target-output',
    amountPerMinute: 20,
    configuredAmountPerMinute: 20,
    maxAmountPerMinute: 100,
    sinkPointsPerMinute: 40,
    ...patch,
  };
}
