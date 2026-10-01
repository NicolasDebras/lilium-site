import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { BalStats } from '../../core/models';
import { AdminPage } from './admin';

/** Laisse ngOnInit (async) finir après le flush HTTP, puis rafraîchit la vue. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const OVERVIEW = { builds: 3, compos: 2, profiles: 42, total_bal: 174_873_783 };

function balStats(days = 30, due = 174_873_783): BalStats {
  return {
    days, bucket: days <= 31 ? 'day' : 'week',
    totals: { due, players: 21, credited: 232_732_165, withdrawn: 103_228_539, activities: 37 },
    flow: [
      { start: '2026-09-29', credited: 5_000_000, withdrawn: 0 },
      { start: '2026-09-30', credited: 0, withdrawn: 2_000_000 },
      { start: '2026-10-01', credited: 1_000_000, withdrawn: 500_000 },
    ],
    due: [{ date: '2026-09-29', total: 100 }, { date: '2026-09-30', total: 80 }, { date: '2026-10-01', total: due }],
    top_players: [{ name: 'RE0', amount: 48_373_560 }, { name: 'Cocoloig', amount: 32_377_797 }],
    by_template: [{ template: 'STATIK', silver: 75_415_214, activities: 18 }],
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

  it('affiche les chiffres clés', async () => {
    const { el } = await loaded();
    const cards = el.querySelectorAll('.stat');
    expect(cards.length).toBe(3);
    expect(el.textContent).toContain('42');
    expect(el.textContent).toContain('Profils enregistrés');
  });

  it('charge la BAL sur 30 jours par défaut et affiche la BAL due en grand', async () => {
    const r = await render();
    const req = r.http.expectOne((q) => q.url === '/api/guilds/111/admin/bal');
    expect(req.request.params.get('days')).toBe('30');
    req.flush(balStats());
    r.http.expectOne('/api/guilds/111/admin/overview').flush(OVERVIEW);
    await settle(r.fixture);

    expect(r.el.querySelector('.hero-value')?.textContent?.trim()).toBe('175 M');
    expect(r.el.querySelector('.hero')?.textContent).toContain('21 joueurs');
    const tiles = Object.fromEntries(
      [...r.el.querySelectorAll('.tile')].map((t) => [t.querySelector('span')?.textContent?.trim(), t.querySelector('strong')?.textContent?.trim()]),
    );
    expect(tiles['Crédité sur la période']).toBe('233 M');
    expect(tiles['Payé (retiré)']).toBe('103 M');
    expect(tiles['Solde net']).toBe('+130 M');
    expect(tiles["Fins d'activité payées"]).toBe('37');
  });

  it('dessine les graphiques et leurs tableaux de données', async () => {
    const { el } = await loaded();
    expect(el.querySelector('app-flow-chart svg')).not.toBeNull();
    expect(el.querySelector('app-line-chart svg')).not.toBeNull();
    const bars = el.querySelectorAll('app-hbar-chart li');
    expect(bars.length).toBe(3);   // 2 joueurs + 1 compo
    expect(bars[0].textContent).toContain('RE0');
    expect(el.textContent).toContain('18 activités');
    expect(el.querySelectorAll('details table tbody tr').length).toBe(6);   // 3 jours × 2 tableaux
  });

  it('changer de période recharge, en gardant l’ancien rendu estompé', async () => {
    const { fixture, http, el } = await loaded();
    el.querySelectorAll<HTMLButtonElement>('.periods .btn')[2].click();
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/bal');
    expect(req.request.params.get('days')).toBe('180');
    expect(el.querySelector('.dashboard.stale')).not.toBeNull();
    expect(el.querySelector('.hero-value')?.textContent?.trim()).toBe('175 M');

    req.flush(balStats(180, 50_000_000));
    await settle(fixture);
    expect(el.querySelector('.dashboard.stale')).toBeNull();
    expect(el.querySelector('.hero-value')?.textContent?.trim()).toBe('50 M');
    expect(el.querySelector('.periods .btn.on')?.textContent).toContain('6 mois');
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
