import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ItemId, MachineId } from '@beltwise/game-data';
import type { PowerTarget } from '@beltwise/planner-core';
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
  public readonly draggedPowerTargetId = signal<string | null>(null);
  public readonly powerTargetDropHint = signal<TargetDropHint | null>(null);

  public readonly configuredTargetCount = computed(() => {
    return countConfiguredTargets(this.planConfig.targetRows());
  });
  public readonly configuredPowerTargetCount = computed(() => {
    return this.planConfig.powerTargetRows().filter((row) => row.isComplete).length;
  });
  public readonly hasPowerTargetCatalog = computed(() => {
    return this.planConfig.powerTargetGeneratorOptions().length > 0;
  });
  public readonly canAddPowerTarget = computed(() => {
    return (
      this.planConfig.hasActivePlan() &&
      !this.planConfig.editingLocked() &&
      this.hasPowerTargetCatalog()
    );
  });

  public readonly targets = this.planConfig.targetRows;
  public readonly powerTargets = this.planConfig.powerTargetRows;
  public readonly planNotes = this.planConfig.planNotes;

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    this.planConfig.targetCommands.updateItem(targetId, itemId);
  }

  public updateTargetAmount(targetId: string, value: string | number | null): void {
    this.planConfig.targetCommands.updateAmount(targetId, parsePlannerNumber(value));
  }

  public updatePowerTargetMode(targetId: string, value: string): void {
    const mode = powerTargetModeFromInput(value);
    if (mode) {
      this.planConfig.powerTargetCommands.updateMode(targetId, mode);
    }
  }

  public updatePowerTargetGenerator(targetId: string, value: string): void {
    this.planConfig.powerTargetCommands.updateGenerator(targetId, optionalMachineId(value));
  }

  public updatePowerTargetFuel(targetId: string, value: string): void {
    this.planConfig.powerTargetCommands.updateFuel(targetId, optionalItemId(value));
  }

  public updatePowerTargetAmount(targetId: string, value: string | number | null): void {
    this.planConfig.powerTargetCommands.updateAmount(targetId, parsePlannerNumber(value));
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

  public startPowerTargetDrag(targetId: string, event: DragEvent): void {
    if (this.planConfig.editingLocked()) {
      event.preventDefault();
      return;
    }

    this.draggedPowerTargetId.set(targetId);
    this.powerTargetDropHint.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', targetId);
    }
  }

  public handlePowerTargetDragOver(targetId: string, event: DragEvent): void {
    const draggedTargetId = this.draggedPowerTargetId();
    if (!draggedTargetId || draggedTargetId === targetId || this.planConfig.editingLocked()) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.powerTargetDropHint.set({ targetId, position: targetDropPosition(event) });
  }

  public dropPowerTarget(targetId: string, event: DragEvent): void {
    event.preventDefault();
    const draggedTargetId =
      this.draggedPowerTargetId() || event.dataTransfer?.getData('text/plain') || null;
    const position = this.powerTargetDropHint()?.position ?? targetDropPosition(event);
    this.finishPowerTargetDrag();
    if (!draggedTargetId || draggedTargetId === targetId || this.planConfig.editingLocked()) {
      return;
    }

    this.reorderPowerTarget(draggedTargetId, targetId, position);
  }

  public finishPowerTargetDrag(): void {
    this.draggedPowerTargetId.set(null);
    this.powerTargetDropHint.set(null);
  }

  public handlePowerTargetDragKeydown(targetId: string, event: KeyboardEvent): void {
    if (this.planConfig.editingLocked()) {
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const rows = this.powerTargets();
    const currentIndex = rows.findIndex((row) => row.target.id === targetId);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
    const anchorTarget = rows[nextIndex]?.target;
    if (!anchorTarget) {
      return;
    }

    this.reorderPowerTarget(
      targetId,
      anchorTarget.id,
      event.key === 'ArrowUp' ? 'before' : 'after',
    );
  }

  private reorderPowerTarget(
    draggedTargetId: string,
    anchorTargetId: string,
    position: TargetDropPosition,
  ): void {
    const nextTargetIds = reorderedTargetIds(
      this.powerTargets().map((row) => row.target),
      draggedTargetId,
      anchorTargetId,
      position,
    );
    if (nextTargetIds) {
      this.planConfig.powerTargetCommands.reorder(nextTargetIds);
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

interface ReorderableTarget {
  readonly id: string;
}

function reorderedTargetIds(
  rows: readonly ReorderableTarget[],
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

function powerTargetModeFromInput(value: string): PowerTarget['mode'] | null {
  return value === 'generator-count' || value === 'power' ? value : null;
}

function optionalMachineId(value: string): MachineId | undefined {
  const id = value.trim();
  return id.length > 0 ? id : undefined;
}

function optionalItemId(value: string): ItemId | undefined {
  const id = value.trim();
  return id.length > 0 ? id : undefined;
}
