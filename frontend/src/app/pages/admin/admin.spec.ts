import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { BalPeriod, BalStats } from '../../core/models';
import { AdminPage } from './admin';

/** Laisse ngOnInit (async) finir après le flush HTTP, puis rafraîchit la vue. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const OVERVIEW = { builds: 3, compos: 2, profiles: 42, total_bal: 174_873_783 };

function heatmap(): number[][] {
  const h = Array.from({ length: 7 }, () => Array(24).fill(0));
  h[4][21] = 3;   // vendredi 21h
  h[1][20] = 1;
  return h;
}

export function balStats(period: BalPeriod = '30d', due = 174_873_783): BalStats {
  return {
    period, days: period === 'week' ? 4 : 30, start: '2026-09-02', bucket: 'day',
    totals: { due, players: 21, credited: 232_732_165, withdrawn: 103_228_539, activities: 37,
              avg_per_activity: 5_042_208, avg_players_per_activity: 4.5 },
    previous: { credited: 116_366_082, withdrawn: 103_228_539, activities: 0 },
    flow: [
      { start: '2026-09-29', credited: 5_000_000, withdrawn: 0 },
      { start: '2026-09-30', credited: 0, withdrawn: 2_000_000 },
      { start: '2026-10-01', credited: 1_000_000, withdrawn: 500_000 },
    ],
    due: [{ date: '2026-09-29', total: 100 }, { date: '2026-09-30', total: 80 }, { date: '2026-10-01', total: due }],
    top_players: [{ name: 'RE0', amount: 48_373_560 }, { name: 'Cocoloig', amount: 32_377_797 }],
    top_earners: [{ name: 'Cocoloig', amount: 43_237_732 }],
    top_callers: [{ name: 'Coskko', silver: 65_677_302, activities: 12 }, { name: 'Ariia I', silver: 38_140_348, activities: 10 }],
    by_template: [{ template: 'STATIK', silver: 75_415_214, activities: 18 }],
    heatmap: heatmap(),
  };
}

describe('AdminPage', () => {
  beforeAll(() => registerLocaleData(localeFr));

  async function render() {
    TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AdminPage);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  async function loaded() {
    const r = await render();
    r.http.expectOne((q) => q.url === '/api/guilds/111/admin/bal').flush(balStats());
    r.http.expectOne('/api/guilds/111/admin/overview').flush(OVERVIEW);
    await settle(r.fixture);
    return r;
  }

  function tiles(el: HTMLElement): Record<string, string> {
    return Object.fromEntries([...el.querySelectorAll('.tile')].map((t) => [
      t.querySelector('.tile-label')?.textContent?.trim(),
      t.querySelector('.tile-value strong')?.textContent?.trim(),
    ]));
  }

  it('affiche les chiffres clés de la guilde', async () => {
    const { el } = await loaded();
    const stats = [...el.querySelectorAll('.overview .stat')].map((s) =>
      `${s.querySelector('.value')?.textContent?.trim()} ${s.querySelector('.muted')?.textContent?.trim()}`);
    expect(stats).toEqual(['42 profils (/register)', '3 builds', '2 compos']);
  });

  it('charge 30 jours par défaut et affiche la BAL due en grand', async () => {
    const r = await render();
    const req = r.http.expectOne((q) => q.url === '/api/guilds/111/admin/bal');
    expect(req.request.params.get('period')).toBe('30d');
    req.flush(balStats());
    r.http.expectOne('/api/guilds/111/admin/overview').flush(OVERVIEW);
    await settle(r.fixture);

    expect(r.el.querySelector('.hero-value')?.textContent?.trim()).toBe('175 M');
    expect(r.el.querySelector('.hero')?.textContent).toContain('21 joueurs');
    const t = tiles(r.el);
    expect(t['Crédité']).toBe('233 M');
    expect(t['Payé (retiré)']).toBe('103 M');
    expect(t['Solde net']).toBe('+130 M');
    expect(t["Fins d'activité"]).toBe('37');
    expect(t['Gain moyen / acti']).toBe('5 M');
    expect(t['Joueurs moyens / acti']).toBe('4,5');
  });

  it('affiche la variation vs la période précédente', async () => {
    const { el } = await loaded();
    const deltas = [...el.querySelectorAll('.tile')].map((t) => t.querySelector('app-delta')?.textContent?.replace(/\s+/g, ' ').trim());
    expect(deltas[0]).toBe('▲ 100 %');           // crédité : doublé
    expect(deltas[1]).toBe('=');                  // retiré identique
    expect(deltas[3]).toBe('nouveau');            // aucune acti avant
    expect(el.querySelector('.tile app-delta .good')).not.toBeNull();
  });

  it('dessine tous les graphiques et leurs tableaux de données', async () => {
    const { el } = await loaded();
    expect(el.querySelector('app-flow-chart svg')).not.toBeNull();
    expect(el.querySelector('app-line-chart svg')).not.toBeNull();
    expect(el.querySelectorAll('app-heatmap .heat .cell').length).toBe(7 * 24);
    expect(el.querySelector('app-heatmap .peak')?.textContent).toContain('vendredi 21h–22h (3)');
    const charts = [...el.querySelectorAll('.chart h3')].map((h) => h.textContent?.trim() ?? '');
    expect(charts.some((h) => h.startsWith('Top callers'))).toBe(true);
    expect(el.textContent).toContain('Coskko');
    expect(el.textContent).toContain('12 activités');
    expect(el.textContent).toContain('Top gagnants');
    expect(el.querySelectorAll('details table tbody tr').length).toBe(6);   // 3 jours × 2 tableaux
  });

  it('propose « Cette semaine » et « 7 jours », et garde l’ancien rendu estompé pendant le rechargement', async () => {
    const { fixture, http, el } = await loaded();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('app-period-picker button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cette semaine', '7 jours', '30 jours', '90 jours', '6 mois']);

    buttons[0].click();
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/bal');
    expect(req.request.params.get('period')).toBe('week');
    expect(el.querySelector('.dashboard.stale')).not.toBeNull();
    expect(el.querySelector('.hero-value')?.textContent?.trim()).toBe('175 M');

    req.flush(balStats('week', 50_000_000));
    await settle(fixture);
    expect(el.querySelector('.dashboard.stale')).toBeNull();
    expect(el.querySelector('.hero-value')?.textContent?.trim()).toBe('50 M');
    expect(el.querySelector('app-period-picker button.on')?.textContent).toContain('Cette semaine');
  });

  it('affiche le refus de l’API (403)', async () => {
    const { fixture, http, el } = await render();
    const denied = { detail: 'Réservé aux admins du site (/webadmin).' };
    http.expectOne((q) => q.url === '/api/guilds/111/admin/bal').flush(denied, { status: 403, statusText: 'Forbidden' });
    http.expectOne('/api/guilds/111/admin/overview').flush(denied, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(el.querySelectorAll('.alert').length).toBe(1);
    expect(el.querySelector('.alert')?.textContent).toContain('/webadmin');
  });
});
