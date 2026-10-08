import { Component, input } from '@angular/core';

/** Logo Lilium : lys stylisé en dégradé lilas + nom + pastille BETA. */
@Component({
  selector: 'app-logo',
  template: `
    <span class="logo" [class.big]="size() === 'big'">
      <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="lilium-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e6d3ff" />
            <stop offset=".55" stop-color="#a77bf3" />
            <stop offset="1" stop-color="#7254bd" />
          </linearGradient>
        </defs>
        <path fill="url(#lilium-grad)"
              d="M16 2c2.6 3 3.8 6.3 3.6 9.6-.1 2-1.2 3.9-3.6 5.4-2.4-1.5-3.5-3.4-3.6-5.4C12.2 8.3 13.4 5 16 2Z" />
        <path fill="url(#lilium-grad)" opacity=".85"
              d="M4 10.5c3.7-.3 6.8.8 8.9 3.2 1.2 1.4 1.8 3.2 1.4 5.6-2.6.4-4.6-.2-6-1.6C6 15.4 4.6 13.2 4 10.5Z" />
        <path fill="url(#lilium-grad)" opacity=".85"
              d="M28 10.5c-3.7-.3-6.8.8-8.9 3.2-1.2 1.4-1.8 3.2-1.4 5.6 2.6.4 4.6-.2 6-1.6 2.3-2.3 3.7-4.5 4.3-7.2Z" />
        <path fill="url(#lilium-grad)" d="M10 21.5h12l-1.3 2.6h-9.4zM14.4 24.1h3.2l-.6 5.9h-2z" />
      </svg>
      <span class="name">Lilium</span>
      @if (beta()) {
        <span class="beta" title="Site en cours de développement">BETA</span>
      }
    </span>
  `,
  styles: `
    .logo { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 1.15rem;
            letter-spacing: -.01em; color: var(--text); }
    .mark { width: 28px; height: 28px; filter: drop-shadow(0 0 10px rgba(167, 123, 243, .45)); }
    .name { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .big { font-size: 2.4rem; gap: 14px; }
    .big .mark { width: 56px; height: 56px; }
    .big .beta { font-size: .7rem; }
  `,
})
export class Logo {
  readonly size = input<'normal' | 'big'>('normal');
  readonly beta = input(true);
}
