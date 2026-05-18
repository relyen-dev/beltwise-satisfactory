import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import type { Item, ItemId } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import { PlannerStoreService } from '../state/planner-store.service';
import type { ExternalInputRow } from '../state/planner-store.selectors';

describe('PlannerInputsSectionComponent', () => {
  it('clamps draft amounts before merging into an existing external input', () => {
    const { component, store, setItemInputCalls } = createComponentHarness();
    store.externalInputRows.set([{ item: rotorItem, amountPerMinute: 8 }]);

    component.addDraftInput();
    component.updateInputAmount(draftInputRow(component), -5);
    component.updateInputItem(draftInputRow(component), rotorItem.id);

    expect(setItemInputCalls).toEqual([{ itemId: rotorItem.id, amountPerMinute: 8 }]);
    expect(component.inputRows().filter((row) => row.kind === 'draft')).toHaveLength(0);
  });

  it('keeps a draft row when the plan locks before the item is selected', () => {
    const { component, store, setItemInputCalls } = createComponentHarness();

    component.addDraftInput();
    store.planLocked.set(true);
    component.updateInputItem(draftInputRow(component), rotorItem.id);

    expect(setItemInputCalls).toEqual([]);
    expect(component.inputRows().filter((row) => row.kind === 'draft')).toHaveLength(1);
  });
});

function createComponentHarness(): {
  component: PlannerInputsSectionComponent;
  setItemInputCalls: SetItemInputCall[];
  store: PlannerInputsStoreHarness;
} {
  const setItemInputCalls: SetItemInputCall[] = [];
  const store: PlannerInputsStoreHarness = {
    activeProject: signal({ id: 'project-a' }),
    externalInputRows: signal<ExternalInputRow[]>([]),
    itemOptions: signal<Item[]>([rotorItem]),
    planLocked: signal(false),
    removeExternalInput: () => undefined,
    setItemInput: (itemId, amountPerMinute) => {
      setItemInputCalls.push({ itemId, amountPerMinute });
    },
    updateExternalInputItem: () => undefined,
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerStoreService, useValue: store }],
  });
  const component = runInInjectionContext(
    injector,
    () => new PlannerInputsSectionComponent(),
  );

  return { component, setItemInputCalls, store };
}

function draftInputRow(component: PlannerInputsSectionComponent) {
  const row = component.inputRows().find((candidate) => candidate.kind === 'draft');
  if (!row) {
    throw new Error('Expected a draft input row');
  }
  return row;
}

interface PlannerInputsStoreHarness {
  activeProject: ReturnType<typeof signal<{ id: string }>>;
  externalInputRows: ReturnType<typeof signal<ExternalInputRow[]>>;
  itemOptions: ReturnType<typeof signal<Item[]>>;
  planLocked: ReturnType<typeof signal<boolean>>;
  removeExternalInput: (itemId: ItemId) => void;
  setItemInput: (itemId: ItemId, amountPerMinute: number) => void;
  updateExternalInputItem: (previousItemId: ItemId, nextItemId: ItemId) => void;
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
