import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import type { Item, ItemId } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { SinkRuleRow } from '../state/planner-store.selectors';
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
});

function createComponentHarness(
  options: {
    availableSurplusSinkItems?: readonly Item[];
  } = {},
): {
  addSurplusCalls: ItemId[];
  component: PlannerSinksSectionComponent;
  planConfig: PlannerSinksPlanConfigHarness;
} {
  const addSurplusCalls: ItemId[] = [];
  const planConfig: PlannerSinksPlanConfigHarness = {
    editingLocked: signal(false),
    availableSurplusSinkItems: signal<Item[]>([...(options.availableSurplusSinkItems ?? [])]),
    sinkRuleRows: signal<SinkRuleRow[]>([]),
    sinkCommands: {
      addSurplus: (itemId) => addSurplusCalls.push(itemId),
      remove: () => undefined,
      removeSurplusForItem: () => undefined,
      toggleSurplus: () => undefined,
    },
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerPlanConfigStore, useValue: planConfig }],
  });
  const component = runInInjectionContext(injector, () => new PlannerSinksSectionComponent());

  return { addSurplusCalls, component, planConfig };
}

interface PlannerSinksPlanConfigHarness {
  editingLocked: WritableSignal<boolean>;
  availableSurplusSinkItems: WritableSignal<Item[]>;
  sinkRuleRows: WritableSignal<SinkRuleRow[]>;
  sinkCommands: {
    addSurplus: (itemId: ItemId) => void;
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
