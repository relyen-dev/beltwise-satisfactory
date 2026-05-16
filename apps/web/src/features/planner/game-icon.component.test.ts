import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { GameIconComponent } from './game-icon.component';

describe('GameIconComponent', () => {
  it('treats decorative icons as silent supporting visuals', () => {
    const component = createComponent({
      label: 'Iron Plate',
      showTitle: true,
      src: '/game-icons/Desc_IronPlate_C.png',
    });

    expect(component.normalizedSrc()).toBe('/game-icons/Desc_IronPlate_C.png');
    expect(component.titleText()).toBe('Iron Plate');
    expect(component.imageAltText()).toBe('');
    expect(component.fallbackAriaLabel()).toBeNull();

    component.markIconUnavailable();

    expect(component.iconUnavailable()).toBe(true);
    expect(component.fallbackAriaLabel()).toBeNull();
  });

  it('keeps a non-decorative accessible label when an image fails', () => {
    const component = createComponent({
      decorative: false,
      label: 'Assembler',
      src: '/game-icons/Desc_AssemblerMk1_C.png',
    });

    expect(component.imageAltText()).toBe('Assembler');

    component.markIconUnavailable();

    expect(component.iconUnavailable()).toBe(true);
    expect(component.fallbackAriaLabel()).toBe('Assembler');
  });

  it('does not render blank source values', () => {
    const component = createComponent({
      label: 'Portable Miner',
      src: '   ',
    });

    expect(component.normalizedSrc()).toBeNull();
    expect(component.iconUnavailable()).toBe(false);
  });
});

function createComponent(inputs: GameIconInputs): TestGameIconComponent {
  const injector = Injector.create({ providers: [] });
  const component = runInInjectionContext(injector, () => new TestGameIconComponent());
  component.setInputs(inputs);
  return component;
}

interface GameIconInputs {
  src: string | null;
  label: string;
  decorative?: boolean;
  showTitle?: boolean;
}

class TestGameIconComponent extends GameIconComponent {
  private readonly srcValue = signal<string | null>(null);
  private readonly labelValue = signal('');
  private readonly decorativeValue = signal(true);
  private readonly showTitleValue = signal(false);

  public override readonly src = this.srcValue.asReadonly() as GameIconComponent['src'];
  public override readonly label = this.labelValue.asReadonly() as GameIconComponent['label'];
  public override readonly decorative =
    this.decorativeValue.asReadonly() as GameIconComponent['decorative'];
  public override readonly showTitle =
    this.showTitleValue.asReadonly() as GameIconComponent['showTitle'];

  public setInputs(inputs: GameIconInputs): void {
    this.srcValue.set(inputs.src);
    this.labelValue.set(inputs.label);
    this.decorativeValue.set(inputs.decorative ?? true);
    this.showTitleValue.set(inputs.showTitle ?? false);
  }
}
