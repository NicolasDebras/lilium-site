import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Durée du défilement d'un montant. */
export const COUNT_UP_MS = 600;

/** Animation voulue : navigateur qui sait la jouer et utilisateur qui ne demande pas à réduire les animations
 *  (sans matchMedia, ex. dans les tests, la valeur s'affiche directement). */
function animate(): boolean {
  return typeof requestAnimationFrame === 'function' && typeof matchMedia === 'function'
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Montant qui défile de l'ancienne valeur (0 au départ) à la nouvelle :
 *  <td [appCountUp]="total" [countUpFormat]="silver"></td>. null → « – ». */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number | null>();
  readonly countUpFormat = input<(n: number) => string>((n) => String(Math.round(n)));

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private shown = 0;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    effect(() => {
      const target = this.appCountUp();
      const format = this.countUpFormat();
      this.stop();
      if (target == null) {
        this.el.textContent = '–';
        this.shown = 0;
        return;
      }
      if (!animate() || target === this.shown) {
        this.render(target, format);
        return;
      }
      const from = this.shown;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / COUNT_UP_MS);
        this.render(from + (target - from) * (1 - (1 - p) ** 3), format);   // ease-out
        if (p < 1) this.frame = requestAnimationFrame(step);
        else this.render(target, format);
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  private stop(): void {
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private render(value: number, format: (n: number) => string): void {
    this.shown = value;
    this.el.textContent = format(value);
  }
}
