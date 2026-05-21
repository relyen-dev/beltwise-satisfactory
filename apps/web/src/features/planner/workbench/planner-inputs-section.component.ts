import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { PlannerStoreService } from '../state/planner-store.service';
import { parsePlannerNumber } from '../shared-ui/planner-ui.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';

interface DraftExternalInputRow {
  id: string;
  projectId: string;
  amountPerMinute: number;
  kind: 'draft';
  itemId: '';
}

interface SavedExternalInputRow {
  id: ItemId;
  amountPerMinute: number;
  kind: 'saved';
  itemId: ItemId;
}

type ExternalInputViewRow = DraftExternalInputRow | SavedExternalInputRow;

let nextDraftExternalInputId = 0;

@Component({
  selector: 'bw-planner-inputs-section',
  standalone: true,
  imports: [FormsModule, TargetItemPickerComponent],
  templateUrl: './planner-inputs-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInputsSectionComponent {
  public readonly store = inject(PlannerStoreService);
  private readonly draftInputRows = signal<readonly DraftExternalInputRow[]>([]);

  public readonly inputRows = computed<ExternalInputViewRow[]>(() => {
    const projectId = this.store.activeProject()?.id;
    const savedRows = this.store.workbenchViews.externalInputRows().map((row) => ({
      id: row.item.id,
      itemId: row.item.id,
      amountPerMinute: row.amountPerMinute,
      kind: 'saved' as const,
    }));
    const draftRows = projectId
      ? this.draftInputRows().filter((row) => row.projectId === projectId)
      : [];

    return [...savedRows, ...draftRows];
  });

  public readonly canAddInput = computed(() => {
    if (this.store.graphView.planLocked() || !this.store.activeProject()) {
      return false;
    }

    return this.store.workbenchViews.itemOptions().length > 0;
  });

  public addDraftInput(): void {
    const projectId = this.store.activeProject()?.id;
    if (!projectId || !this.canAddInput()) {
      return;
    }

    this.draftInputRows.update((rows) => [
      ...rows,
      {
        id: `draft-input-${++nextDraftExternalInputId}`,
        projectId,
        itemId: '',
        amountPerMinute: 10,
        kind: 'draft',
      },
    ]);
  }

  public updateInputItem(row: ExternalInputViewRow, itemId: ItemId): void {
    if (this.store.graphView.planLocked() || itemId.length === 0) {
      return;
    }

    if (row.kind === 'saved') {
      this.store.updateExternalInputItem(row.itemId, itemId);
      return;
    }

    const existingAmountPerMinute =
      this.store.workbenchViews.externalInputRows().find((inputRow) => inputRow.item.id === itemId)
        ?.amountPerMinute ?? 0;
    this.store.setItemInput(
      itemId,
      existingAmountPerMinute + safeExternalInputAmount(row.amountPerMinute),
    );
    this.removeDraftInput(row.id);
  }

  public updateInputAmount(row: ExternalInputViewRow, value: string | number | null): void {
    if (this.store.graphView.planLocked()) {
      return;
    }

    const amountPerMinute = safeExternalInputAmount(parsePlannerNumber(value));
    if (row.kind === 'saved') {
      this.store.setItemInput(row.itemId, amountPerMinute);
      return;
    }

    this.draftInputRows.update((rows) =>
      rows.map((draft) =>
        draft.id === row.id
          ? {
              ...draft,
              amountPerMinute,
            }
          : draft,
      ),
    );
  }

  public removeInput(row: ExternalInputViewRow): void {
    if (this.store.graphView.planLocked()) {
      return;
    }

    if (row.kind === 'saved') {
      this.store.removeExternalInput(row.itemId);
      return;
    }

    this.removeDraftInput(row.id);
  }

  private removeDraftInput(rowId: string): void {
    this.draftInputRows.update((rows) => rows.filter((row) => row.id !== rowId));
  }
}

function safeExternalInputAmount(amountPerMinute: number): number {
  return Math.max(0, Number.isFinite(amountPerMinute) ? amountPerMinute : 0);
}
