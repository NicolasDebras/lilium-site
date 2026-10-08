import { Component, input, output } from '@angular/core';

import { BalPeriod } from '../core/models';

export const BAL_PERIODS: { value: BalPeriod; label: string; hint: string }[] = [
  { value: 'week', label: 'Cette semaine', hint: 'Depuis lundi (heure de Paris)' },
  { value: '7d', label: '7 jours', hint: 'Les 7 derniers jours' },
  { value: '30d', label: '30 jours', hint: 'Les 30 derniers jours' },
  { value: '90d', label: '90 jours', hint: 'Les 90 derniers jours' },
  { value: '180d', label: '6 mois', hint: 'Les 6 derniers mois (historique conservé par le bot)' },
];

export function periodLabel(period: BalPeriod): string {
  return BAL_PERIODS.find((p) => p.value === period)?.label ?? period;
}

/** Sélecteur de période BAL (Admin et Ma BAL) — une seule rangée au-dessus des graphiques. */
@Component({
  selector: 'app-period-picker',
  template: `
    <div class="segmented" role="group" aria-label="Période">
      @for (p of periods; track p.value) {
        <button type="button" [class.on]="value() === p.value" [attr.aria-pressed]="value() === p.value"
                [title]="p.hint" (click)="pick(p.value)">{{ p.label }}</button>
      }
    </div>
  `,
})
export class PeriodPicker {
  readonly value = input.required<BalPeriod>();
  readonly valueChange = output<BalPeriod>();
  protected readonly periods = BAL_PERIODS;

  pick(period: BalPeriod): void {
    if (period !== this.value()) this.valueChange.emit(period);
  }
}
