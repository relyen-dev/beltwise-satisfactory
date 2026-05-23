import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId } from '@beltwise/game-data';
import type { ProductTarget } from '@beltwise/planner-core';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { countConfiguredTargets, parsePlannerNumber } from '../shared-ui/planner-ui.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';

@Component({
  selector: 'bw-planner-targets-section',
  standalone: true,
  imports: [FormsModule, TargetItemPickerComponent],
  templateUrl: './planner-targets-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerTargetsSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
  public readonly draggedTargetId = signal<string | null>(null);
  public readonly targetDropHint = signal<TargetDropHint | null>(null);

  public readonly configuredTargetCount = computed(() => {
    return countConfiguredTargets(this.planConfig.targetRows());
  });

  public readonly targets = this.planConfig.targetRows;
  public readonly planNotes = this.planConfig.planNotes;

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    this.planConfig.targetCommands.updateItem(targetId, itemId);
  }

  public updateTargetAmount(targetId: string, value: string | number | null): void {
    this.planConfig.targetCommands.updateAmount(targetId, parsePlannerNumber(value));
  }

  public startTargetDrag(targetId: string, event: DragEvent): void {
    if (this.planConfig.editingLocked()) {
      event.preventDefault();
      return;
    }

    this.draggedTargetId.set(targetId);
    this.targetDropHint.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', targetId);
    }
  }

  public handleTargetDragOver(targetId: string, event: DragEvent): void {
    const draggedTargetId = this.draggedTargetId();
    if (!draggedTargetId || draggedTargetId === targetId || this.planConfig.editingLocked()) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.targetDropHint.set({ targetId, position: targetDropPosition(event) });
  }

  public dropTarget(targetId: string, event: DragEvent): void {
    event.preventDefault();
    const draggedTargetId =
      this.draggedTargetId() || event.dataTransfer?.getData('text/plain') || null;
    const position = this.targetDropHint()?.position ?? targetDropPosition(event);
    this.finishTargetDrag();
    if (!draggedTargetId || draggedTargetId === targetId || this.planConfig.editingLocked()) {
      return;
    }

    this.reorderTarget(draggedTargetId, targetId, position);
  }

  public finishTargetDrag(): void {
    this.draggedTargetId.set(null);
    this.targetDropHint.set(null);
  }

  public handleTargetDragKeydown(targetId: string, event: KeyboardEvent): void {
    if (this.planConfig.editingLocked()) {
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const rows = this.targets();
    const currentIndex = rows.findIndex((target) => target.id === targetId);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
    const anchorTarget = rows[nextIndex];
    if (!anchorTarget) {
      return;
    }

    this.reorderTarget(targetId, anchorTarget.id, event.key === 'ArrowUp' ? 'before' : 'after');
  }

  private reorderTarget(
    draggedTargetId: string,
    anchorTargetId: string,
    position: TargetDropPosition,
  ): void {
    const nextTargetIds = reorderedTargetIds(
      this.targets(),
      draggedTargetId,
      anchorTargetId,
      position,
    );
    if (nextTargetIds) {
      this.planConfig.targetCommands.reorder(nextTargetIds);
    }
  }
}

type TargetDropPosition = 'before' | 'after';

interface TargetDropHint {
  readonly targetId: string;
  readonly position: TargetDropPosition;
}

function targetDropPosition(event: DragEvent): TargetDropPosition {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return 'after';
  }

  const rect = target.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function reorderedTargetIds(
  rows: readonly ProductTarget[],
  draggedTargetId: string,
  anchorTargetId: string,
  position: TargetDropPosition,
): readonly string[] | null {
  const currentTargetIds = rows.map((target) => target.id);
  const withoutDraggedTarget = currentTargetIds.filter((targetId) => targetId !== draggedTargetId);
  const anchorIndex = withoutDraggedTarget.indexOf(anchorTargetId);
  if (anchorIndex < 0 || !currentTargetIds.includes(draggedTargetId)) {
    return null;
  }

  const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1;
  const nextTargetIds = [
    ...withoutDraggedTarget.slice(0, insertIndex),
    draggedTargetId,
    ...withoutDraggedTarget.slice(insertIndex),
  ];

  return arraysEqual(nextTargetIds, currentTargetIds) ? null : nextTargetIds;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
