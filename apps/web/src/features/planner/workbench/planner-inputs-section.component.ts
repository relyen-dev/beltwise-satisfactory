import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { AssumedInputRow } from '../state/planner-store.selectors';
import { GameIconComponent } from '../shared-ui/game-icon.component';
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
  imports: [FormsModule, GameIconComponent, TargetItemPickerComponent],
  templateUrl: './planner-inputs-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerInputsSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
  private readonly draftInputRows = signal<readonly DraftExternalInputRow[]>([]);

  public readonly inputRows = computed<ExternalInputViewRow[]>(() => {
    const projectId = this.planConfig.activePlanId();
    const savedRows = this.planConfig.externalInputRows().map((row) => ({
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

  public readonly assumedInputRows = computed(() => this.planConfig.assumedInputRows());

  public readonly canAddInput = computed(() => {
    if (this.planConfig.editingLocked() || !this.planConfig.hasActivePlan()) {
      return false;
    }

    return this.planConfig.itemOptions().length > 0;
  });

  public addDraftInput(): void {
    const projectId = this.planConfig.activePlanId();
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
    if (this.planConfig.editingLocked() || itemId.length === 0) {
      return;
    }

    if (row.kind === 'saved') {
      this.planConfig.inputCommands.move(row.itemId, itemId);
      return;
    }

    this.planConfig.inputCommands.set(
      itemId,
      this.externalInputAmount(itemId) + safeExternalInputAmount(row.amountPerMinute),
    );
    this.removeDraftInput(row.id);
  }

  public addAssumedInputToExternalInputs(row: AssumedInputRow): void {
    if (this.planConfig.editingLocked()) {
      return;
    }

    this.planConfig.inputCommands.set(
      row.item.id,
      this.externalInputAmount(row.item.id) + safeExternalInputAmount(row.amountPerMinute),
    );
  }

  public updateInputAmount(row: ExternalInputViewRow, value: string | number | null): void {
    if (this.planConfig.editingLocked()) {
      return;
    }

    const amountPerMinute = safeExternalInputAmount(parsePlannerNumber(value));
    if (row.kind === 'saved') {
      this.planConfig.inputCommands.set(row.itemId, amountPerMinute);
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
    if (this.planConfig.editingLocked()) {
      return;
    }

    if (row.kind === 'saved') {
      this.planConfig.inputCommands.remove(row.itemId);
      return;
    }

    this.removeDraftInput(row.id);
  }

  private removeDraftInput(rowId: string): void {
    this.draftInputRows.update((rows) => rows.filter((row) => row.id !== rowId));
  }

  private externalInputAmount(itemId: ItemId): number {
    return (
      this.planConfig.externalInputRows().find((inputRow) => inputRow.item.id === itemId)
        ?.amountPerMinute ?? 0
    );
  }
}

function safeExternalInputAmount(amountPerMinute: number): number {
  return Math.max(0, Number.isFinite(amountPerMinute) ? amountPerMinute : 0);
}
