import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { activityStats as stats } from '../../../testing/admin-data';
import { ActivityStatsPanel } from './activity-stats';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('ActivityStatsPanel (page Admin)', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [ActivityStatsPanel], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ActivityStatsPanel);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  it('charge 30 jours par défaut : tuiles, classements, rôles qui manquent', async () => {
    const { fixture, http, el } = await render();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/activity');
    expect(req.request.params.get('period')).toBe('30d');
    req.flush(stats());
    await settle(fixture);
    const tiles = [...el.querySelectorAll('.tile')].map((t) =>
      `${t.querySelector('.muted')?.textContent?.trim()} ${t.querySelector('strong')?.textContent?.trim()}`);
    expect(tiles).toEqual(['Actis jouées 12', 'Annulées 2', 'Joueurs différents 25', 'Joueurs / acti 8,5', 'Remplissage 76 %']);
    expect(el.textContent).toContain('Bnkiller');
    expect(el.textContent).toContain('HEAL');
    expect(el.textContent).toContain('par jour');
  });

  it('courbe : actis jouées = finacti + fin, sans les annulations', async () => {
    const { fixture, http } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/activity').flush(stats());
    await settle(fixture);
    expect(fixture.componentInstance['timeline']()).toEqual([
      { date: '2026-10-07', total: 3 },
      { date: '2026-10-08', total: 3 },
    ]);
  });

  it('remplissage inconnu : tiret', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/activity').flush(stats({ fill_rate: null }));
    await settle(fixture);
    expect(el.querySelectorAll('.tile')[4].textContent).toContain('—');
  });

  it('historique vide : message explicatif, pas de graphiques', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/activity').flush(stats({ activities: 0, cancelled: 0 }));
    await settle(fixture);
    expect(el.querySelector('.empty')?.textContent).toContain('Aucune activité terminée');
    expect(el.querySelector('.tile')).toBeNull();
  });

  it('changer de période recharge avec le paramètre', async () => {
    const { fixture, http } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/activity').flush(stats());
    await settle(fixture);
    fixture.componentInstance.setPeriod('7d');
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/activity');
    expect(req.request.params.get('period')).toBe('7d');
    req.flush(stats());
  });

  it('erreur API : message d’alerte', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/activity')
      .flush({ detail: 'Réservé aux admins.' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(el.querySelector('.alert')?.textContent).toContain('Réservé aux admins.');
  });
});
