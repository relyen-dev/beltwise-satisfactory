import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type ElementRef } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationUpdateNoticeComponent } from './application-update-notice.component';
import { ApplicationUpdateNoticeService } from './application-update-notice.service';

describe('ApplicationUpdateNoticeComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves focus to the refresh action when the update notice appears', () => {
    vi.useFakeTimers();
    const visible = signal(false);
    const focus = vi.fn();
    const component = createComponentHarness({ visible });
    stubRefreshButton(component, focus);

    component.ngAfterViewChecked();
    visible.set(true);
    component.ngAfterViewChecked();
    vi.runOnlyPendingTimers();

    expect(focus).toHaveBeenCalledOnce();
  });

  it('keeps tab focus on the refresh action', () => {
    const focus = vi.fn();
    const preventDefault = vi.fn();
    const component = createComponentHarness();
    stubRefreshButton(component, focus);

    component.keepFocusOnRefreshButton({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('refreshes through the update notice service', () => {
    const refreshPage = vi.fn();
    const component = createComponentHarness({ refreshPage });

    component.refreshPage();

    expect(refreshPage).toHaveBeenCalledOnce();
  });
});

function createComponentHarness(
  options: Partial<ApplicationUpdateNoticeHarness> = {},
): ApplicationUpdateNoticeComponent {
  const service = {
    message: 'It looks like the application has been updated. Refresh the page to continue.',
    refreshPage: options.refreshPage ?? vi.fn(),
    visible: options.visible ?? signal(true),
  };
  const injector = Injector.create({
    providers: [{ provide: ApplicationUpdateNoticeService, useValue: service }],
  });

  return runInInjectionContext(injector, () => new ApplicationUpdateNoticeComponent());
}

function stubRefreshButton(
  component: ApplicationUpdateNoticeComponent,
  focus: ReturnType<typeof vi.fn>,
): void {
  const buttonRef: ElementRef<HTMLButtonElement> = {
    nativeElement: { focus } as unknown as HTMLButtonElement,
  };
  Object.defineProperty(component, 'refreshButton', {
    configurable: true,
    value: () => buttonRef,
  });
}

interface ApplicationUpdateNoticeHarness {
  readonly refreshPage: () => void;
  readonly visible: ReturnType<typeof signal<boolean>>;
}
