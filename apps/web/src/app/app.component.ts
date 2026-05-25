import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApplicationUpdateNoticeComponent } from './application-update-notice.component';

@Component({
  selector: 'bw-root',
  standalone: true,
  imports: [RouterOutlet, ApplicationUpdateNoticeComponent],
  template: '<router-outlet /><bw-application-update-notice />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
