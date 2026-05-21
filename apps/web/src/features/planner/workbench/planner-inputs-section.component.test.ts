import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import type { Item, ItemId } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { ExternalInputRow } from '../state/planner-store.selectors';

describe('PlannerInputsSectionComponent', () => {
  it('clamps draft amounts before merging into an existing external input', () => {
    const { component, planConfig, setItemInputCalls } = createComponentHarness();
    planConfig.externalInputRows.set([{ item: rotorItem, amountPerMinute: 8 }]);

    component.addDraftInput();
    component.updateInputAmount(draftInputRow(component), -5);
    component.updateInputItem(draftInputRow(component), rotorItem.id);

    expect(setItemInputCalls).toEqual([{ itemId: rotorItem.id, amountPerMinute: 8 }]);
    expect(component.inputRows().filter((row) => row.kind === 'draft')).toHaveLength(0);
  });

  it('keeps a draft row when the plan locks before the item is selected', () => {
    const { component, planConfig, setItemInputCalls } = createComponentHarness();

    component.addDraftInput();
    planConfig.editingLocked.set(true);
    component.updateInputItem(draftInputRow(component), rotorItem.id);

    expect(setItemInputCalls).toEqual([]);
    expect(component.inputRows().filter((row) => row.kind === 'draft')).toHaveLength(1);
  });
});

function createComponentHarness(): {
  component: PlannerInputsSectionComponent;
  setItemInputCalls: SetItemInputCall[];
  planConfig: PlannerInputsPlanConfigHarness;
} {
  const setItemInputCalls: SetItemInputCall[] = [];
  const planConfig: PlannerInputsPlanConfigHarness = {
    activePlanId: signal<string | null>('project-a'),
    hasActivePlan: signal(true),
    editingLocked: signal(false),
    externalInputRows: signal<ExternalInputRow[]>([]),
    itemOptions: signal<Item[]>([rotorItem]),
    inputCommands: {
      remove: () => undefined,
      set: (itemId, amountPerMinute) => {
        setItemInputCalls.push({ itemId, amountPerMinute });
      },
      move: () => undefined,
    },
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerPlanConfigStore, useValue: planConfig }],
  });
  const component = runInInjectionContext(injector, () => new PlannerInputsSectionComponent());

  return { component, planConfig, setItemInputCalls };
}

function draftInputRow(component: PlannerInputsSectionComponent) {
  const row = component.inputRows().find((candidate) => candidate.kind === 'draft');
  if (!row) {
    throw new Error('Expected a draft input row');
  }
  return row;
}

interface PlannerInputsPlanConfigHarness {
  activePlanId: ReturnType<typeof signal<string | null>>;
  hasActivePlan: ReturnType<typeof signal<boolean>>;
  editingLocked: ReturnType<typeof signal<boolean>>;
  externalInputRows: ReturnType<typeof signal<ExternalInputRow[]>>;
  itemOptions: ReturnType<typeof signal<Item[]>>;
  inputCommands: {
    remove: (itemId: ItemId) => void;
    set: (itemId: ItemId, amountPerMinute: number) => void;
    move: (previousItemId: ItemId, nextItemId: ItemId) => void;
  };
}

interface SetItemInputCall {
  itemId: ItemId;
  amountPerMinute: number;
}

const rotorItem: Item = {
  id: 'Desc_Rotor_C',
  className: 'Desc_Rotor_C',
  displayName: 'Rotor',
  form: 'solid',
};
