import { Component, input } from '@angular/core';

/** Loader Lilium : le lys se trace puis pulse, entouré d'un anneau de runes qui tourne
 *  (même motif que l'écran de démarrage d'index.html). Purement décoratif : le parent
 *  porte le role="status" et le texte. */
@Component({
  selector: 'app-lys-loader',
  host: { 'aria-hidden': 'true', '[style.--size.px]': 'size()' },
  template: `
    <svg class="ring" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="30" stroke-dasharray="2 4" />
      <path class="ticks" d="M32 0v5M32 59v5M0 32h5M59 32h5" />
      <path class="gems" d="m32 7 2.5 2.5L32 12l-2.5-2.5zM32 52l2.5 2.5L32 57l-2.5-2.5zM7 32l2.5-2.5L12 32l-2.5 2.5zM52 32l2.5-2.5L57 32l-2.5 2.5z" />
    </svg>
    <svg class="lys" viewBox="0 0 32 32">
      <path d="M16 2c2.6 3 3.8 6.3 3.6 9.6-.1 2-1.2 3.9-3.6 5.4-2.4-1.5-3.5-3.4-3.6-5.4C12.2 8.3 13.4 5 16 2Z" />
      <path d="M4 10.5c3.7-.3 6.8.8 8.9 3.2 1.2 1.4 1.8 3.2 1.4 5.6-2.6.4-4.6-.2-6-1.6C6 15.4 4.6 13.2 4 10.5Z" />
      <path d="M28 10.5c-3.7-.3-6.8.8-8.9 3.2-1.2 1.4-1.8 3.2-1.4 5.6 2.6.4 4.6-.2 6-1.6 2.3-2.3 3.7-4.5 4.3-7.2Z" />
      <path d="M10 21.5h12l-1.3 2.6h-9.4zM14.4 24.1h3.2l-.6 5.9h-2z" />
    </svg>
  `,
  styles: `
    :host { position: relative; display: inline-block; width: var(--size); height: var(--size); flex: none; }
    svg { position: absolute; display: block; }  /* top/left + taille explicite : Safari ignore « inset » seul sur un SVG */
    .ring { top: 0; left: 0; width: 100%; height: 100%; stroke: var(--lilac-deep); animation: spin 8s linear infinite; }
    .ticks { stroke: var(--lilac); stroke-width: 1.5; }
    .gems { fill: var(--lilac-strong); stroke: none; }
    .lys { top: 24%; left: 24%; width: 52%; height: 52%; filter: drop-shadow(0 0 8px var(--lilac-glow)); }
    /* trace (contour) → remplissage → pulsation, en boucle */
    .lys path { fill: var(--lilac); fill-opacity: 0; stroke: var(--lilac); stroke-width: .7;
                stroke-dasharray: 60; stroke-dashoffset: 60; animation: draw 2.4s var(--ease) infinite; }
    .lys path:nth-child(2) { animation-delay: .12s; }
    .lys path:nth-child(3) { animation-delay: .24s; }
    .lys path:nth-child(4) { animation-delay: .36s; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes draw {
      0% { stroke-dashoffset: 60; fill-opacity: 0; opacity: 1; }
      45% { stroke-dashoffset: 0; fill-opacity: 0; }
      65% { fill-opacity: 1; }
      85% { stroke-dashoffset: 0; fill-opacity: 1; opacity: 1; }
      100% { stroke-dashoffset: 0; fill-opacity: 1; opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .lys path { animation: none; stroke-dashoffset: 0; fill-opacity: 1; }
    }
  `,
})
export class LysLoader {
  readonly size = input(56);
}
