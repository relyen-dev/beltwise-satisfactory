import { ErrorHandler, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { isApplicationUpdateError } from './application-update-error';

export interface ApplicationUpdateBrowserAdapter {
  readonly reloadPage: () => void;
}

export class ApplicationUpdateRequiredError extends Error {
  public override readonly name = 'ApplicationUpdateRequiredError';

  public constructor(public readonly originalError: unknown) {
    super('Application update required');
  }
}

export function isApplicationUpdateRequiredError(
  error: unknown,
): error is ApplicationUpdateRequiredError {
  return error instanceof ApplicationUpdateRequiredError;
}

export const APPLICATION_UPDATE_BROWSER = new InjectionToken<ApplicationUpdateBrowserAdapter>(
  'Beltwise application update browser adapter',
  {
    providedIn: 'root',
    factory: () => ({
      reloadPage: () => {
        globalThis.location?.reload();
      },
    }),
  },
);

@Injectable({ providedIn: 'root' })
export class ApplicationUpdateNoticeService {
  private readonly browser = inject(APPLICATION_UPDATE_BROWSER);
  private readonly visibleSignal = signal(false);

  public readonly visible = this.visibleSignal.asReadonly();
  public readonly message =
    'It looks like the application has been updated. Refresh the page to continue.';

  public notifyIfApplicationUpdateError(error: unknown): boolean {
    if (!isApplicationUpdateError(error)) {
      return false;
    }

    this.show();
    return true;
  }

  public show(): void {
    this.visibleSignal.set(true);
  }

  public refreshPage(): void {
    this.browser.reloadPage();
  }
}

@Injectable()
export class ApplicationUpdateErrorHandler implements ErrorHandler {
  private readonly updateNotice = inject(ApplicationUpdateNoticeService);

  public handleError(error: unknown): void {
    if (this.updateNotice.notifyIfApplicationUpdateError(error)) {
      return;
    }

    console.error('ERROR', error);
  }
}
