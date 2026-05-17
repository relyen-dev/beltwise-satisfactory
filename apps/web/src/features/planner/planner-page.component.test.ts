import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerPageComponent } from './planner-page.component';
import {
  PlannerStoreService,
  type ConfigurationTab,
  type WorkbenchFocusRequest,
} from './planner-store.service';

describe('PlannerPageComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLElement', TestHTMLElement);
    vi.stubGlobal('document', { activeElement: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a workbench section and closes it when the active open section is requested again', () => {
    const { component, store } = createComponentHarness();

    component.openSection('recipes');

    expect(store.activeConfigTab()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(true);

    component.openSection('recipes');

    expect(store.activeConfigTab()).toBe('recipes');
    expect(component.workPanelOpen()).toBe(false);
  });

  it('clears graph selection from Escape when focus is not editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(clearSelectedGraphNode).toHaveBeenCalledOnce();
    expect(store.selectedGraphNodeId()).toBeNull();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not clear graph selection from Escape when focus is editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    const editableTargets = [
      new TestHTMLElement('input'),
      new TestHTMLElement('textarea'),
      new TestHTMLElement('select'),
      new TestHTMLElement('div', { isContentEditable: true }),
    ];

    for (const target of editableTargets) {
      const event = keyboardEvent(target);

      component.clearGraphSelectionFromKeyboard(event);

      expect(clearSelectedGraphNode).not.toHaveBeenCalled();
      expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('closes the defaults panel from Escape before clearing graph selection', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('div'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(component.defaultsPanelOpen()).toBe(false);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('keeps the defaults panel open from Escape when focus is editable', () => {
    const { component, store, clearSelectedGraphNode } = createComponentHarness();
    component.defaultsPanelOpen.set(true);
    const event = keyboardEvent(new TestHTMLElement('input'));

    component.clearGraphSelectionFromKeyboard(event);

    expect(component.defaultsPanelOpen()).toBe(true);
    expect(clearSelectedGraphNode).not.toHaveBeenCalled();
    expect(store.selectedGraphNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('flushes graph node positions before unloading', () => {
    const { component, flushGraphNodePositions } = createComponentHarness();

    component.flushGraphNodePositionsBeforeUnload();

    expect(flushGraphNodePositions).toHaveBeenCalledOnce();
  });
});

function createComponentHarness(): {
  clearSelectedGraphNode: ReturnType<typeof vi.fn>;
  component: PlannerPageComponent;
  flushGraphNodePositions: ReturnType<typeof vi.fn>;
  store: PlannerPageStoreHarness;
} {
  const clearSelectedGraphNode = vi.fn();
  const flushGraphNodePositions = vi.fn();
  const store: PlannerPageStoreHarness = {
    activeConfigTab: signal<ConfigurationTab>('plan'),
    clearSelectedGraphNode: () => {
      clearSelectedGraphNode();
      store.selectedGraphNodeId.set(null);
    },
    flushGraphNodePositions,
    selectedGraphNodeId: signal<string | null>('recipe:Recipe_IronPlate_C'),
    workbenchFocusRequest: signal<WorkbenchFocusRequest | null>(null),
  };
  const injector = Injector.create({
    providers: [{ provide: PlannerStoreService, useValue: store }],
  });
  const component = runInInjectionContext(injector, () => new PlannerPageComponent());

  return { clearSelectedGraphNode, component, flushGraphNodePositions, store };
}

function keyboardEvent(target: TestHTMLElement): KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    preventDefault: vi.fn(),
    target,
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

interface PlannerPageStoreHarness {
  activeConfigTab: WritableSignal<ConfigurationTab>;
  clearSelectedGraphNode: () => void;
  flushGraphNodePositions: () => void;
  selectedGraphNodeId: WritableSignal<string | null>;
  workbenchFocusRequest: WritableSignal<WorkbenchFocusRequest | null>;
}

class TestHTMLElement {
  public readonly tagName: string;
  public readonly isContentEditable: boolean;

  public constructor(tagName: string, options: { isContentEditable?: boolean } = {}) {
    this.tagName = tagName.toUpperCase();
    this.isContentEditable = options.isContentEditable ?? false;
  }

  public blur(): void {
    return undefined;
  }

  public closest(_selector: string): TestHTMLElement | null {
    return null;
  }
}
