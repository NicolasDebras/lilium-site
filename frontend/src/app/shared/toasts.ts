import { Component, inject } from '@angular/core';

import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind">
          <app-icon [name]="t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'" />
          <span>{{ t.text }}</span>
          <button type="button" class="x" aria-label="Fermer" (click)="toasts.dismiss(t.id)">
            <app-icon name="close" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; z-index: 50; right: 16px; bottom: 16px; display: grid; gap: 8px;
              max-width: min(380px, calc(100vw - 32px)); }
    .toast { display: flex; align-items: center; gap: 10px; padding: 11px 12px 11px 14px; border-radius: 12px;
             background: var(--surface-2); border: 1px solid var(--border); box-shadow: var(--shadow-lg);
             animation: fade-up .25s var(--ease) both; font-size: .9rem; }
    .toast.success app-icon:first-child { color: var(--success); }
    .toast.error { border-color: rgba(255, 107, 139, .5); }
    .toast.error app-icon:first-child { color: var(--danger); }
    .toast.info app-icon:first-child { color: var(--lilac); }
    span { flex: 1; }
    .x { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; padding: 2px; border-radius: 6px; }
    .x:hover { color: var(--text); background: var(--surface-3); }
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
