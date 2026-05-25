import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import {
  ApplicationUpdateErrorHandler,
  ApplicationUpdateNoticeService,
} from './application-update-notice.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: ErrorHandler, useClass: ApplicationUpdateErrorHandler },
    provideRouter(
      routes,
      withNavigationErrorHandler((navigationError) => {
        inject(ApplicationUpdateNoticeService).notifyIfApplicationUpdateError(
          navigationError.error,
        );
      }),
    ),
  ],
};
