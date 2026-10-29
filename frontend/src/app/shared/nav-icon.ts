import { Component, input } from '@angular/core';

import { Icon, IconName } from './icon';

/** Icône d'onglet de la barre du haut, animée quand l'onglet est actif (ou survolé) :
 *  Builds → l'épée frappe, Ma balance → des pièces tombent sur la pile, Admin → le bouclier
 *  a des yeux qui surveillent. Les autres onglets gardent l'icône simple.
 *  Animations déclenchées par la classe `active` du lien parent (routerLinkActive). */
@Component({
  selector: 'app-nav-icon',
  imports: [Icon],
  template: `
    @switch (name()) {
      @case ('sword') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path class="slash" d="M2.5 11.5a11 11 0 0 1 9-9" />
          <g class="blade"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /></g>
        </svg>
      }
      @case ('coins') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <ellipse class="drop d1" cx="9" cy="5" rx="2.6" ry="2.6" />
          <ellipse class="drop d2" cx="15" cy="4" rx="2.6" ry="2.6" />
          <path d="M5 15.5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
          <ellipse cx="12" cy="15.5" rx="7" ry="2.5" />
          <path d="M5 17.6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" stroke-width="1.5" />
        </svg>
      }
      @case ('shield') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <g class="eyes">
            <ellipse cx="9.4" cy="11" rx="1.9" ry="2.1" stroke-width="1.4" />
            <ellipse cx="14.6" cy="11" rx="1.9" ry="2.1" stroke-width="1.4" />
            <g class="pupils" fill="currentColor" stroke="none">
              <circle cx="9.4" cy="11.3" r="1" />
              <circle cx="14.6" cy="11.3" r="1" />
            </g>
          </g>
        </svg>
      }
      @default {
        <app-icon [name]="name()" [size]="size()" />
      }
    }
  `,
  host: { '[style.--size.px]': 'size()', 'aria-hidden': 'true' },
  styles: `
    :host { display: inline-flex; flex: none; line-height: 0; }
    svg { display: block; width: var(--size); height: var(--size); overflow: visible; }
    g, ellipse, circle { transform-box: view-box; }

    /* Épée : coup de taille (bascule autour de la garde) + traînée, toutes les 2,8 s */
    .blade { transform-origin: 18px 18px; }
    .slash { stroke-dasharray: 16; stroke-dashoffset: 16; opacity: 0; stroke-width: 1.5; }
    :host-context(a.active) .blade { animation: swing 2.8s var(--ease) infinite; }
    :host-context(a.active) .slash { animation: slash 2.8s var(--ease) infinite; }
    :host-context(a:hover:not(.active)) .blade { animation: swing 1s var(--ease); }
    @keyframes swing {
      0%, 55%, 100% { transform: rotate(0); }
      66% { transform: rotate(28deg); }
      76% { transform: rotate(-14deg); }
      86% { transform: rotate(4deg); }
    }
    @keyframes slash {
      0%, 66% { stroke-dashoffset: 16; opacity: 0; }
      74% { stroke-dashoffset: 0; opacity: .9; }
      90%, 100% { stroke-dashoffset: -16; opacity: 0; }
    }

    /* Pièces : tombent en tournoyant sur la pile, l'une après l'autre */
    .drop { transform-origin: center; transform-box: fill-box; }
    :host-context(a.active) .drop { animation: fall 1.8s cubic-bezier(.5, 0, .9, .6) infinite; }
    :host-context(a.active) .d2 { animation-delay: .9s; }
    :host-context(a:hover:not(.active)) .d1 { animation: fall 1.8s cubic-bezier(.5, 0, .9, .6); }
    @keyframes fall {
      0% { transform: translateY(-6px) scaleX(1); opacity: 0; }
      15% { opacity: 1; }
      40% { transform: translateY(1px) scaleX(.2); }
      70% { transform: translateY(8px) scaleX(1); opacity: 1; }
      85%, 100% { transform: translateY(9px) scaleX(1); opacity: 0; }
    }

    /* Admin : les yeux regardent à gauche, à droite, et clignent */
    .eyes { transform-origin: 12px 11px; }
    :host-context(a.active) .pupils { animation: look 4s ease-in-out infinite; }
    :host-context(a.active) .eyes { animation: blink 4s infinite; }
    :host-context(a:hover:not(.active)) .pupils { animation: look 2s ease-in-out; }
    @keyframes look {
      0%, 12%, 100% { transform: translateX(0); }
      20%, 38% { transform: translateX(-.9px); }
      46%, 64% { transform: translateX(.9px); }
      72%, 90% { transform: translate(0, -.6px); }
    }
    @keyframes blink {
      0%, 66%, 72%, 100% { transform: scaleY(1); }
      69% { transform: scaleY(.1); }
    }
  `,
})
export class NavIcon {
  readonly name = input.required<IconName>();
  readonly size = input(17);
}
