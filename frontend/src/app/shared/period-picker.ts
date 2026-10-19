import { Component, inject, input, output } from '@angular/core';

import { I18nService, dict } from '../core/i18n/i18n';
import { BalPeriod } from '../core/models';

/** Périodes BAL, dans l'ordre d'affichage (libellés : dictionnaire `periods`). */
export const BAL_PERIODS: readonly BalPeriod[] = ['week', '7d', '30d', '90d', '180d'];

export function periodLabel(period: BalPeriod): string {
  return dict().periods[period]?.label ?? period;
}

/** Sélecteur de période BAL (Admin et Ma BAL) — une seule rangée au-dessus des graphiques. */
@Component({
  selector: 'app-period-picker',
  template: `
    <div class="segmented" role="group" [attr.aria-label]="t().periods.aria">
      @for (p of periods; track p) {
        <button type="button" [class.on]="value() === p" [attr.aria-pressed]="value() === p"
                [title]="t().periods[p].hint" (click)="pick(p)">{{ t().periods[p].label }}</button>
      }
    </div>
  `,
})
export class PeriodPicker {
  readonly value = input.required<BalPeriod>();
  readonly valueChange = output<BalPeriod>();
  protected readonly periods = BAL_PERIODS;
  protected readonly t = inject(I18nService).t;

  pick(period: BalPeriod): void {
    if (period !== this.value()) this.valueChange.emit(period);
  }
}
