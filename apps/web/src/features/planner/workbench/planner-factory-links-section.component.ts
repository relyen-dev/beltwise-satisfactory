import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type Item, type ItemId } from '@beltwise/game-data';
import { PlannerFactoryLinksStore } from '../state/planner-factory-links.store';
import { GameIconComponent } from '../shared-ui/game-icon.component';
import { parsePlannerNumber } from '../shared-ui/planner-ui.helpers';
import { TargetItemPickerComponent } from '../shared-ui/target-item-picker.component';

@Component({
  selector: 'bw-planner-factory-links-section',
  standalone: true,
  imports: [FormsModule, GameIconComponent, TargetItemPickerComponent],
  templateUrl: './planner-factory-links-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerFactoryLinksSectionComponent {
  public readonly links = inject(PlannerFactoryLinksStore);

  public readonly sourceTargetId = signal('');
  public readonly destinationProjectId = signal('');
  public readonly destinationItemId = signal<ItemId>('');
  public readonly amountPerMinute = signal('10');
  private readonly linkAmountDrafts = signal<ReadonlyMap<string, string>>(new Map());

  public readonly destinationItems = computed<readonly Item[]>(() => {
    const selectedSource = this.selectedSourceTarget();
    const item = selectedSource?.itemId
      ? this.links.sourceTargetOptions().find((option) => option.itemId === selectedSource.itemId)
      : undefined;
    return item
      ? [
          {
            id: item.itemId,
            className: item.itemId,
            displayName: item.displayName,
            form: 'solid',
          },
        ]
      : [];
  });

  public readonly canCreateLink = computed(() => {
    return (
      this.sourceTargetId().length > 0 &&
      this.destinationProjectId().length > 0 &&
      this.destinationItemId().length > 0 &&
      parseAmount(this.amountPerMinute()) > 0
    );
  });

  public constructor() {
    effect(() => {
      const draft = this.links.draftSourceTarget();
      if (!draft) {
        return;
      }
      this.selectSourceTarget(draft.targetId);
    });
    effect(() => {
      const options = this.links.destinationProjectOptions();
      if (
        this.destinationProjectId().length === 0 ||
        !options.some((option) => option.projectId === this.destinationProjectId())
      ) {
        this.destinationProjectId.set(options[0]?.projectId ?? '');
      }
    });
  }

  public selectSourceTarget(targetId: string): void {
    const option = this.links
      .sourceTargetOptions()
      .find((candidate) => candidate.targetId === targetId);
    this.sourceTargetId.set(option?.targetId ?? '');
    this.destinationItemId.set(option?.itemId ?? '');
    this.amountPerMinute.set(formatAmountInput(option?.amountPerMinute ?? 10));
  }

  public setDestinationItem(itemId: ItemId): void {
    this.destinationItemId.set(itemId);
  }

  public createLink(): void {
    const amountPerMinute = parseAmount(this.amountPerMinute());
    if (!this.canCreateLink() || amountPerMinute <= 0) {
      return;
    }
    this.links.createLink({
      sourceTargetId: this.sourceTargetId(),
      destinationProjectId: this.destinationProjectId(),
      destinationItemId: this.destinationItemId(),
      amountPerMinute,
    });
    this.sourceTargetId.set('');
    this.destinationItemId.set('');
    this.amountPerMinute.set('10');
  }

  public updateLinkAmount(linkId: string, value: string | number | null): void {
    this.setLinkAmountDraft(linkId, draftValue(value));
    const amountPerMinute = parsePlannerNumber(value);
    if (!Number.isFinite(amountPerMinute) || amountPerMinute <= 0) {
      return;
    }
    this.links.updateAmount(linkId, amountPerMinute);
  }

  public finishLinkAmountEdit(linkId: string): void {
    this.linkAmountDrafts.update((drafts) => {
      if (!drafts.has(linkId)) {
        return drafts;
      }
      const nextDrafts = new Map(drafts);
      nextDrafts.delete(linkId);
      return nextDrafts;
    });
  }

  public linkAmountInputValue(linkId: string, amountPerMinute: number): string {
    return this.linkAmountDrafts().get(linkId) ?? formatAmountInput(amountPerMinute);
  }

  private selectedSourceTarget() {
    return this.links
      .sourceTargetOptions()
      .find((option) => option.targetId === this.sourceTargetId());
  }

  private setLinkAmountDraft(linkId: string, value: string): void {
    this.linkAmountDrafts.update((drafts) => {
      const nextDrafts = new Map(drafts);
      nextDrafts.set(linkId, value);
      return nextDrafts;
    });
  }
}

function parseAmount(value: string): number {
  const amountPerMinute = Number(value);
  return Number.isFinite(amountPerMinute) ? amountPerMinute : 0;
}

function formatAmountInput(value: number): string {
  return (Math.round((Math.max(0, value) + Number.EPSILON) * 1000) / 1000).toString();
}

function draftValue(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'number' ? value.toString() : value;
}
