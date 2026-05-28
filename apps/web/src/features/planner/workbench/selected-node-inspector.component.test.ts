import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { PlannerFactoryLinksStore } from '../state/planner-factory-links.store';
import { PlannerGraphStore } from '../state/planner-graph.store';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { SelectedNodeInspectorComponent } from './selected-node-inspector.component';
import { PlannerWorkbenchSlice } from './planner-workbench-state';

describe('SelectedNodeInspectorComponent', () => {
  it('starts a factory link draft and requests the Links panel', () => {
    const startDraftFromTarget = vi.fn();
    const requestOpenPanel = vi.fn();
    const injector = Injector.create({
      providers: [
        {
          provide: PlannerGraphStore,
          useValue: {
            readModel: { inspectorViewModel: signal(null) },
            selectionCommands: { clear: vi.fn() },
          },
        },
        { provide: PlannerPlanConfigStore, useValue: { sinkCommands: {} } },
        { provide: PlannerFactoryLinksStore, useValue: { startDraftFromTarget } },
        { provide: PlannerWorkbenchSlice, useValue: { requestOpenPanel } },
      ],
    });
    const component = runInInjectionContext(injector, () => new SelectedNodeInspectorComponent());

    component.startFactoryLink('target-plate', 'Desc_IronPlate_C');

    expect(startDraftFromTarget).toHaveBeenCalledWith({
      targetId: 'target-plate',
      itemId: 'Desc_IronPlate_C',
    });
    expect(requestOpenPanel).toHaveBeenCalledWith('links');
  });
});
