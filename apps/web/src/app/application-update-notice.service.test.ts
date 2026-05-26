import '@angular/compiler';
import { ErrorHandler, Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPLICATION_UPDATE_BROWSER,
  ApplicationUpdateErrorHandler,
  ApplicationUpdateNoticeService,
  type ApplicationUpdateBrowserAdapter,
} from './application-update-notice.service';

describe('ApplicationUpdateNoticeService', () => {
  it('shows the update notice for stale chunk errors', () => {
    const { service } = createNoticeHarness();

    expect(service.visible()).toBe(false);

    const handled = service.notifyIfApplicationUpdateError(
      new TypeError('Failed to fetch dynamically imported module: /chunk-MISSING.js'),
    );

    expect(handled).toBe(true);
    expect(service.visible()).toBe(true);
  });

  it('leaves unrelated errors unhandled', () => {
    const { service } = createNoticeHarness();

    expect(service.notifyIfApplicationUpdateError(new Error('LP failed'))).toBe(false);
    expect(service.visible()).toBe(false);
  });

  it('refreshes through the browser adapter', () => {
    const { browser, service } = createNoticeHarness();

    service.refreshPage();

    expect(browser.reloadPage).toHaveBeenCalledOnce();
  });
});

describe('ApplicationUpdateErrorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses raw console logging for handled update errors', () => {
    const { errorHandler, service } = createErrorHandlerHarness();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler.handleError(
      new TypeError('Failed to fetch dynamically imported module: /chunk-MISSING.js'),
    );

    expect(service.visible()).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps normal Angular error logging for unrelated errors', () => {
    const { errorHandler, service } = createErrorHandlerHarness();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Something else failed');

    errorHandler.handleError(error);

    expect(service.visible()).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('ERROR', error);
  });
});

function createNoticeHarness(): {
  browser: ApplicationUpdateBrowserAdapter & { reloadPage: ReturnType<typeof vi.fn> };
  service: ApplicationUpdateNoticeService;
} {
  const browser = { reloadPage: vi.fn() };
  const injector = Injector.create({
    providers: [
      ApplicationUpdateNoticeService,
      { provide: APPLICATION_UPDATE_BROWSER, useValue: browser },
    ],
  });

  return {
    browser,
    service: injector.get(ApplicationUpdateNoticeService),
  };
}

function createErrorHandlerHarness(): {
  errorHandler: ErrorHandler;
  service: ApplicationUpdateNoticeService;
} {
  const browser = { reloadPage: vi.fn() };
  const injector = Injector.create({
    providers: [
      ApplicationUpdateNoticeService,
      { provide: APPLICATION_UPDATE_BROWSER, useValue: browser },
      { provide: ErrorHandler, useClass: ApplicationUpdateErrorHandler },
    ],
  });

  return {
    errorHandler: injector.get(ErrorHandler),
    service: injector.get(ApplicationUpdateNoticeService),
  };
}
