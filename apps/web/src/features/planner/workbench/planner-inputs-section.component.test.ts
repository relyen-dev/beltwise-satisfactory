import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import type { Item, ItemId } from '@beltwise/game-data';
import { describe, expect, it } from 'vitest';
import { PlannerInputsSectionComponent } from './planner-inputs-section.component';
import {
  PlannerFactoryLinksStore,
  type FactoryLinkInputCoverageRow,
} from '../state/planner-factory-links.store';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { AssumedInputRow, ExternalInputRow } from '../state/planner-store.selectors';

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

  it('adds assumed input amounts into external inputs', () => {
    const { component, planConfig, setItemInputCalls } = createComponentHarness();
    planConfig.externalInputRows.set([{ item: rotorItem, amountPerMinute: 8 }]);

    component.addAssumedInputToExternalInputs({
      item: rotorItem,
      amountPerMinute: 2.5,
      amountPerMinuteLabel: '2.5/min',
      iconSrc: '/game-icons/Desc_Rotor_C.png',
    });

    expect(setItemInputCalls).toEqual([{ itemId: rotorItem.id, amountPerMinute: 10.5 }]);
  });

  it('creates a new external input from an assumed input unless editing is locked', () => {
    const { component, planConfig, setItemInputCalls } = createComponentHarness();
    const assumedInputRow: AssumedInputRow = {
      item: rotorItem,
      amountPerMinute: 6,
      amountPerMinuteLabel: '6/min',
      iconSrc: '/game-icons/Desc_Rotor_C.png',
    };

    component.addAssumedInputToExternalInputs(assumedInputRow);
    planConfig.editingLocked.set(true);
    component.addAssumedInputToExternalInputs(assumedInputRow);

    expect(setItemInputCalls).toEqual([{ itemId: rotorItem.id, amountPerMinute: 6 }]);
  });

  it('returns linked coverage rows for saved external inputs', () => {
    const { component, factoryLinks } = createComponentHarness();
    factoryLinks.inputCoverageRows.set([
      {
        itemId: rotorItem.id,
        linkedAmountPerMinute: 4,
        manualRemainderAmountPerMinute: 6,
        linkedAmountPerMinuteLabel: '4/min',
        manualRemainderAmountPerMinuteLabel: '6/min',
      },
    ]);

    expect(component.linkedCoverageForItem(rotorItem.id)).toMatchObject({
      linkedAmountPerMinuteLabel: '4/min',
      manualRemainderAmountPerMinuteLabel: '6/min',
    });
  });
});

function createComponentHarness(): {
  component: PlannerInputsSectionComponent;
  setItemInputCalls: SetItemInputCall[];
  planConfig: PlannerInputsPlanConfigHarness;
  factoryLinks: PlannerInputsFactoryLinksHarness;
} {
  const setItemInputCalls: SetItemInputCall[] = [];
  const planConfig: PlannerInputsPlanConfigHarness = {
    activePlanId: signal<string | null>('project-a'),
    hasActivePlan: signal(true),
    editingLocked: signal(false),
    externalInputRows: signal<ExternalInputRow[]>([]),
    assumedInputRows: signal<AssumedInputRow[]>([]),
    itemOptions: signal<Item[]>([rotorItem]),
    inputCommands: {
      remove: () => undefined,
      set: (itemId, amountPerMinute) => {
        setItemInputCalls.push({ itemId, amountPerMinute });
      },
      move: () => undefined,
    },
  };
  const factoryLinks: PlannerInputsFactoryLinksHarness = {
    inputCoverageRows: signal<FactoryLinkInputCoverageRow[]>([]),
  };
  const injector = Injector.create({
    providers: [
      { provide: PlannerPlanConfigStore, useValue: planConfig },
      { provide: PlannerFactoryLinksStore, useValue: factoryLinks },
    ],
  });
  const component = runInInjectionContext(injector, () => new PlannerInputsSectionComponent());

  return { component, planConfig, setItemInputCalls, factoryLinks };
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
  assumedInputRows: ReturnType<typeof signal<AssumedInputRow[]>>;
  itemOptions: ReturnType<typeof signal<Item[]>>;
  inputCommands: {
    remove: (itemId: ItemId) => void;
    set: (itemId: ItemId, amountPerMinute: number) => void;
    move: (previousItemId: ItemId, nextItemId: ItemId) => void;
  };
}

interface PlannerInputsFactoryLinksHarness {
  inputCoverageRows: WritableSignal<FactoryLinkInputCoverageRow[]>;
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
