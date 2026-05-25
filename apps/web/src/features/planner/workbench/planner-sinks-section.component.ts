import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type ItemId } from '@beltwise/game-data';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { formatPlannerNumber } from '../shared-ui/planner-format.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import type { SinkRuleRow, TargetOutputSinkOption } from '../state/planner-store.selectors';

@Component({
  selector: 'bw-planner-sinks-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent, TargetItemPickerComponent],
  templateUrl: './planner-sinks-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerSinksSectionComponent {
  public readonly planConfig = inject(PlannerPlanConfigStore);
  public targetOutputItemId: ItemId = '';
  public targetOutputAmountPerMinute = '';
  private readonly targetOutputSinkAmountDrafts = signal<ReadonlyMap<string, string>>(new Map());

  public addSurplusSink(itemId: ItemId): void {
    if (this.planConfig.editingLocked() || itemId.length === 0) {
      return;
    }
    this.planConfig.sinkCommands.addSurplus(itemId);
  }

  public selectTargetOutputSinkItem(itemId: ItemId): void {
    this.targetOutputItemId = itemId;
    this.targetOutputAmountPerMinute = formatSinkAmountInputValue(
      this.selectedTargetOutputSinkOption()?.remainingAmountPerMinute ?? 0,
    );
  }

  public setTargetOutputAmountInput(value: SinkAmountInputValue): void {
    this.targetOutputAmountPerMinute = sinkAmountDraftValue(value);
  }

  public finishTargetOutputAmountInput(): void {
    const amountPerMinute = parseSinkAmountInput(this.targetOutputAmountPerMinute);
    if (amountPerMinute === null) {
      this.targetOutputAmountPerMinute = '';
      return;
    }
    this.targetOutputAmountPerMinute = formatSinkAmountInputValue(
      this.clampTargetOutputAmount(amountPerMinute, this.selectedTargetOutputRemainingAmount()),
    );
  }

  public addTargetOutputSink(): void {
    if (this.planConfig.editingLocked()) {
      return;
    }
    const option = this.selectedTargetOutputSinkOption();
    if (!option) {
      return;
    }
    const inputAmountPerMinute = parseSinkAmountInput(this.targetOutputAmountPerMinute);
    if (inputAmountPerMinute === null) {
      return;
    }
    const amountPerMinute = this.clampTargetOutputAmount(
      inputAmountPerMinute,
      option.remainingAmountPerMinute,
    );
    if (amountPerMinute <= 0) {
      return;
    }
    this.planConfig.sinkCommands.addTargetOutput(option.itemId, amountPerMinute);
    this.targetOutputItemId = '';
    this.targetOutputAmountPerMinute = '';
  }

  public updateTargetOutputSinkAmount(row: SinkRuleRow, value: SinkAmountInputValue): void {
    if (this.planConfig.editingLocked() || row.mode !== 'target-output') {
      return;
    }
    this.setTargetOutputSinkAmountDraft(row.rule.id, sinkAmountDraftValue(value));
    const amountPerMinute = parseSinkAmountInput(value);
    if (amountPerMinute === null) {
      return;
    }
    const clampedAmountPerMinute = this.clampTargetOutputAmount(
      amountPerMinute,
      row.maxAmountPerMinute ?? 0,
    );
    this.planConfig.sinkCommands.updateTargetOutputAmount(
      row.rule.id,
      clampedAmountPerMinute,
    );
  }

  public finishTargetOutputSinkAmountEdit(row: SinkRuleRow): void {
    this.targetOutputSinkAmountDrafts.update((drafts) => {
      if (!drafts.has(row.rule.id)) {
        return drafts;
      }
      const nextDrafts = new Map(drafts);
      nextDrafts.delete(row.rule.id);
      return nextDrafts;
    });
  }

  public surplusSinkRows(): SinkRuleRow[] {
    return this.planConfig.sinkRuleRows().filter((row) => row.mode === 'surplus');
  }

  public targetOutputSinkRows(): SinkRuleRow[] {
    return this.planConfig.sinkRuleRows().filter((row) => row.mode === 'target-output');
  }

  public targetOutputSinkPickerItems(): TargetOutputSinkOption['item'][] {
    return this.planConfig.availableTargetOutputSinkOptions().map((option) => option.item);
  }

  public amountLabel(amountPerMinute: number): string {
    return `${formatPlannerNumber(amountPerMinute)}/min`;
  }

  public sinkPointsLabel(pointsPerMinute: number | null): string {
    return pointsPerMinute === null ? 'Not sinkable' : `${formatPlannerNumber(pointsPerMinute)}/min`;
  }

  public addPickerLabel(): string {
    return this.planConfig.availableSurplusSinkItems().length === 0
      ? 'No sinkable surplus'
      : 'Add surplus sink';
  }

  public targetOutputPickerLabel(): string {
    return this.planConfig.availableTargetOutputSinkOptions().length === 0
      ? 'No sinkable target output'
      : 'Choose output item';
  }

  public selectedTargetOutputRemainingAmount(): number {
    return this.selectedTargetOutputSinkOption()?.remainingAmountPerMinute ?? 0;
  }

  public canAddTargetOutputSink(): boolean {
    const amountPerMinute = parseSinkAmountInput(this.targetOutputAmountPerMinute);
    return (
      !this.planConfig.editingLocked() &&
      this.selectedTargetOutputRemainingAmount() > 0 &&
      amountPerMinute !== null &&
      amountPerMinute > 0
    );
  }

  public targetOutputSinkAmountInputValue(row: SinkRuleRow): string {
    return (
      this.targetOutputSinkAmountDrafts().get(row.rule.id) ??
      formatSinkAmountInputValue(row.configuredAmountPerMinute)
    );
  }

  private selectedTargetOutputSinkOption(): TargetOutputSinkOption | undefined {
    return this.planConfig
      .availableTargetOutputSinkOptions()
      .find((option) => option.itemId === this.targetOutputItemId);
  }

  private clampTargetOutputAmount(value: number, maxAmountPerMinute: number): number {
    return roundSinkAmount(
      Math.min(Math.max(0, Number.isFinite(value) ? value : 0), maxAmountPerMinute),
    );
  }

  private setTargetOutputSinkAmountDraft(sinkRuleId: string, value: string): void {
    this.targetOutputSinkAmountDrafts.update((drafts) => {
      const nextDrafts = new Map(drafts);
      nextDrafts.set(sinkRuleId, value);
      return nextDrafts;
    });
  }
}

type SinkAmountInputValue = string | number | null;

function sinkAmountDraftValue(value: SinkAmountInputValue): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'number' ? value.toString() : value;
}

function parseSinkAmountInput(value: SinkAmountInputValue): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }
  const amountPerMinute = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amountPerMinute) ? amountPerMinute : null;
}

function formatSinkAmountInputValue(value: number): string {
  return roundSinkAmount(value).toString();
}

function roundSinkAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round((Math.max(0, value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
