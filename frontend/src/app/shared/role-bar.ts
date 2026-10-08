import { Component, computed, input } from '@angular/core';

import { roleColor, sortByRole } from './roles';

export interface RoleCount {
  role: string;
  count: number;
}

/** Additionne les places par rôle (PF1 + PF2), rangées TANK, HEAL, DPS, SUPPORT, puis le reste. */
export function countByRole(rows: { role: string; count: number | null }[]): RoleCount[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.role, (totals.get(r.role) ?? 0) + (r.count ?? 0));
  return sortByRole(
    [...totals].filter(([, n]) => n > 0).map(([role, count]) => ({ role, count })),
    (r) => r.role,
  );
}

/** Barre de composition : un segment par rôle, proportionnel au nombre de joueurs,
 *  avec une légende (nom + nombre) — la couleur n'est jamais le seul repère. */
@Component({
  selector: 'app-role-bar',
  template: `
    @if (parts().length) {
      <div class="bar" role="img" [attr.aria-label]="label()">
        @for (p of parts(); track p.role) {
          <span class="seg" [style.flex-grow]="p.count" [style.background]="color(p.role)"
                [title]="p.role + ' : ' + p.count"></span>
        }
      </div>
      <ul class="legend">
        @for (p of parts(); track p.role) {
          <li><i [style.background]="color(p.role)"></i>{{ emojiOf(p.role) }} {{ p.role }} <b>{{ p.count }}</b></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .bar { display: flex; gap: 2px; height: 10px; border-radius: 999px; overflow: hidden; background: var(--surface-2); }
    .seg { min-width: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; list-style: none; margin: 0; padding: 0;
              font-size: .78rem; color: var(--text-muted); }
    .legend li { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 8px; height: 8px; border-radius: 50%; }
    .legend b { color: var(--text); font-variant-numeric: tabular-nums; }
  `,
})
export class RoleBar {
  readonly rows = input.required<{ role: string; count: number | null }[]>();
  readonly emojis = input<Record<string, string>>({});
  protected readonly parts = computed(() => countByRole(this.rows()));
  protected readonly label = computed(() =>
    'Composition : ' + this.parts().map((p) => `${p.count} ${p.role}`).join(', '));

  protected color(role: string): string {
    return roleColor(role);
  }

  protected emojiOf(role: string): string {
    return this.emojis()[role] ?? '';
  }
}
