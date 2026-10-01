import { Component, computed, input, output } from '@angular/core';

/** Numéros de pages à afficher : toujours la 1re et la dernière, la page courante ± 1,
 *  et « … » pour les trous (ex. 1 … 4 5 6 … 12). Pages numérotées à partir de 1. */
export function pageNumbers(page: number, pageCount: number): (number | '…')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] === 2) out.push(p - 1);       // un seul trou → on affiche le numéro
    else if (i && p - sorted[i - 1] > 2) out.push('…');
    out.push(p);
  });
  return out;
}

/** Pager : « 13–24 sur 40 builds » + Précédent / numéros / Suivant. Masqué s'il n'y a qu'une page. */
@Component({
  selector: 'app-pager',
  template: `
    @if (pageCount() > 1) {
      <nav class="pager" aria-label="Pagination">
        <span class="muted range">{{ from() }}–{{ to() }} sur {{ total() }} {{ label() }}</span>
        <div class="pages">
          <button type="button" class="btn btn-sm" [disabled]="page() <= 1" (click)="go(page() - 1)"
                  aria-label="Page précédente">‹ Précédent</button>
          @for (p of numbers(); track $index) {
            @if (p === '…') {
              <span class="gap muted" aria-hidden="true">…</span>
            } @else {
              <button type="button" class="btn btn-sm num" [class.on]="p === page()"
                      [attr.aria-current]="p === page() ? 'page' : null" [attr.aria-label]="'Page ' + p"
                      (click)="go(p)">{{ p }}</button>
            }
          }
          <button type="button" class="btn btn-sm" [disabled]="page() >= pageCount()" (click)="go(page() + 1)"
                  aria-label="Page suivante">Suivant ›</button>
        </div>
      </nav>
    }
  `,
  styles: `
    .pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin: 20px 0 4px; }
    .range { font-size: .85rem; }
    .pages { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .num { min-width: 34px; }
    .num.on { background: var(--lilac-soft); border-color: var(--lilac-strong); color: var(--lilac); }
    .gap { padding: 0 4px; }
  `,
})
export class Pager {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly label = input('éléments');
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  protected readonly numbers = computed(() => pageNumbers(this.page(), this.pageCount()));

  go(page: number): void {
    if (page >= 1 && page <= this.pageCount() && page !== this.page()) this.pageChange.emit(page);
  }
}
