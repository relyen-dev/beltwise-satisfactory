import {
  type AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  inject,
  type ElementRef,
  viewChild,
} from '@angular/core';
import { ApplicationUpdateNoticeService } from './application-update-notice.service';

@Component({
  selector: 'bw-application-update-notice',
  standalone: true,
  template: `
    @if (updateNotice.visible()) {
      <section
        class="application-update-notice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="application-update-title"
        aria-describedby="application-update-message"
        (keydown.tab)="keepFocusOnRefreshButton($event)"
      >
        <div class="application-update-notice__panel">
          <span class="application-update-notice__kicker">Application updated</span>
          <h1 id="application-update-title">Refresh Beltwise</h1>
          <p id="application-update-message">{{ updateNotice.message }}</p>
          <button #refreshButton type="button" (click)="refreshPage()">
            Refresh page
          </button>
        </div>
      </section>
    }
  `,
  styleUrl: './application-update-notice.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationUpdateNoticeComponent implements AfterViewChecked {
  private readonly refreshButton = viewChild<ElementRef<HTMLButtonElement>>('refreshButton');
  private noticeWasVisible = false;
  public readonly updateNotice = inject(ApplicationUpdateNoticeService);

  public ngAfterViewChecked(): void {
    const visible = this.updateNotice.visible();
    if (!visible) {
      this.noticeWasVisible = false;
      return;
    }
    if (this.noticeWasVisible) {
      return;
    }

    this.noticeWasVisible = true;
    focusElementAfterRender(() => this.refreshButton()?.nativeElement);
  }

  public keepFocusOnRefreshButton(event: Event): void {
    event.preventDefault();
    this.refreshButton()?.nativeElement.focus();
  }

  public refreshPage(): void {
    this.updateNotice.refreshPage();
  }
}

function focusElementAfterRender(element: () => HTMLElement | undefined, attempts = 4): void {
  setTimeout(() => {
    const target = element();
    if (target) {
      target.focus();
      return;
    }
    if (attempts > 0) {
      focusElementAfterRender(element, attempts - 1);
    }
  });
}
