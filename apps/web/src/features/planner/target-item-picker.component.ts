import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Item, ItemId } from '@beltwise/game-data';
import { GameIconComponent } from './game-icon.component';
import { gameIconPathForItemId } from './game-icon.helpers';
import { filterItemsBySearch } from './planner-ui.helpers';

interface TargetItemPickerOption {
  id: ItemId;
  displayName: string;
  iconSrc: string | null;
}

let nextTargetItemPickerId = 0;

@Component({
  selector: 'bw-target-item-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, GameIconComponent],
  templateUrl: './target-item-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetItemPickerComponent {
  public readonly items = input<readonly Item[]>([]);
  public readonly selectedItemId = input<ItemId>('');
  public readonly disabled = input(false);
  public readonly allowEmptySelection = input(true);
  public readonly emptyLabel = input('Select an item');
  public readonly searchLabel = input('Search target items');
  public readonly searchPlaceholder = input('Search items');
  public readonly itemSelected = output<ItemId>();

  public readonly isOpen = signal(false);
  public readonly searchQuery = signal('');
  public readonly activeIndex = signal(0);
  public readonly pickerId = `target-item-picker-${++nextTargetItemPickerId}`;
  public readonly searchInputId = `${this.pickerId}-search`;
  public readonly listboxId = `${this.pickerId}-listbox`;

  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly triggerButton = viewChild<ElementRef<HTMLButtonElement>>('triggerButton');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  public readonly selectedItem = computed(() => {
    const selectedId = this.selectedItemId();
    return this.items().find((item) => item.id === selectedId) ?? null;
  });

  public readonly selectedLabel = computed(() => {
    return this.selectedItem()?.displayName ?? this.emptyLabel();
  });

  public readonly selectedIconSrc = computed(() => {
    const item = this.selectedItem();
    return item ? gameIconPathForItemId(item.id) : null;
  });

  public readonly pickerOptions = computed<TargetItemPickerOption[]>(() => {
    const query = this.searchQuery();
    const itemOptions = filterItemsBySearch(this.items(), query).map((item) => ({
      id: item.id,
      displayName: item.displayName,
      iconSrc: gameIconPathForItemId(item.id),
    }));

    if (query.trim().length > 0 || !this.allowEmptySelection()) {
      return itemOptions;
    }

    return [{ id: '', displayName: this.emptyLabel(), iconSrc: null }, ...itemOptions];
  });

  public readonly activeOptionId = computed(() => {
    return this.pickerOptions()[this.activeIndex()] ? this.optionId(this.activeIndex()) : null;
  });

  public toggleDropdown(): void {
    if (this.isOpen()) {
      this.closeDropdown();
      return;
    }
    this.openDropdown();
  }

  public openDropdown(): void {
    if (this.disabled()) {
      return;
    }
    this.searchQuery.set('');
    this.activeIndex.set(this.selectedOptionIndex());
    this.isOpen.set(true);
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  public closeDropdown(options: { focusTrigger?: boolean } = {}): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.searchQuery.set('');
    this.activeIndex.set(0);
    if (options.focusTrigger) {
      setTimeout(() => this.triggerButton()?.nativeElement.focus());
    }
  }

  public updateSearch(query: string): void {
    this.searchQuery.set(query);
    this.activeIndex.set(0);
  }

  public selectItem(itemId: ItemId): void {
    this.itemSelected.emit(itemId);
    this.closeDropdown({ focusTrigger: true });
  }

  public optionId(index: number): string {
    return `${this.pickerId}-option-${index}`;
  }

  public isSelected(itemId: ItemId): boolean {
    return this.selectedItemId() === itemId;
  }

  public handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.openDropdown();
  }

  public handleSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActiveOption(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActiveOption(-1);
        return;
      case 'Enter':
        event.preventDefault();
        this.selectActiveOption();
        return;
      case 'Escape':
        event.preventDefault();
        this.closeDropdown({ focusTrigger: true });
        return;
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  public closeFromOutsidePointer(event: PointerEvent): void {
    const target = event.target;
    if (
      !this.isOpen() ||
      !(target instanceof Node) ||
      this.hostElement.nativeElement.contains(target)
    ) {
      return;
    }
    this.closeDropdown();
  }

  private moveActiveOption(delta: number): void {
    const optionCount = this.pickerOptions().length;
    if (optionCount === 0) {
      this.activeIndex.set(0);
      return;
    }
    this.activeIndex.update((index) => (index + delta + optionCount) % optionCount);
  }

  private selectActiveOption(): void {
    const option = this.pickerOptions()[this.activeIndex()];
    if (!option) {
      return;
    }
    this.selectItem(option.id);
  }

  private selectedOptionIndex(): number {
    const selectedId = this.selectedItemId();
    const index = this.pickerOptions().findIndex((option) => option.id === selectedId);
    return Math.max(0, index);
  }
}
