import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

type GameIconKind = 'item' | 'machine';
type GameIconSize = 'xs' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'bw-game-icon',
  standalone: true,
  template: `
    @if (normalizedSrc(); as iconSrc) {
      <span
        class="game-icon"
        [class.game-icon--item]="kind() === 'item'"
        [class.game-icon--machine]="kind() === 'machine'"
        [class.game-icon--xs]="size() === 'xs'"
        [class.game-icon--sm]="size() === 'sm'"
        [class.game-icon--md]="size() === 'md'"
        [class.game-icon--lg]="size() === 'lg'"
        [class.game-icon--unavailable]="iconUnavailable()"
        [attr.aria-hidden]="decorative() ? 'true' : null"
        [attr.aria-label]="fallbackAriaLabel()"
        [attr.role]="fallbackAriaLabel() ? 'img' : null"
        [attr.title]="titleText()"
      >
        @if (!iconUnavailable()) {
          <img
            [src]="iconSrc"
            [alt]="imageAltText()"
            [attr.aria-hidden]="decorative() ? 'true' : null"
            decoding="async"
            loading="lazy"
            (error)="markIconUnavailable()"
          />
        }
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameIconComponent {
  public readonly src = input<string | null>(null);
  public readonly label = input('');
  public readonly size = input<GameIconSize>('md');
  public readonly kind = input<GameIconKind>('item');
  public readonly decorative = input(true);
  public readonly showTitle = input(false);

  private readonly unavailableSrc = signal<string | null>(null);

  public readonly normalizedSrc = computed(() => {
    const src = this.src();
    const trimmedSrc = src?.trim() ?? '';
    return trimmedSrc.length > 0 ? trimmedSrc : null;
  });

  public readonly iconUnavailable = computed(() => {
    const src = this.normalizedSrc();
    return src !== null && src === this.unavailableSrc();
  });

  public readonly titleText = computed(() => {
    const label = this.label().trim();
    return this.showTitle() && label.length > 0 ? label : null;
  });

  public readonly imageAltText = computed(() => {
    return this.decorative() ? '' : this.label().trim();
  });

  public readonly fallbackAriaLabel = computed(() => {
    const label = this.label().trim();
    return !this.decorative() && this.iconUnavailable() && label.length > 0 ? label : null;
  });

  public markIconUnavailable(): void {
    this.unavailableSrc.set(this.normalizedSrc());
  }
}
