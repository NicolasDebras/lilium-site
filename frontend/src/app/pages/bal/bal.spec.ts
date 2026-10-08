import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { BalPeriod, MyBalHistory } from '../../core/models';
import { BalPage, ordinal } from './bal';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

function history(period: BalPeriod = '30d', rank: number | null = 4): MyBalHistory {
  return {
    period, days: 30, start: '2026-09-09', bucket: 'day', amount: 14_665_993, rank, players: 24,
    totals: { credited: 13_406_806, withdrawn: 40_000, activities: 12 },
    flow: [{ start: '2026-10-07', credited: 2_647_797, withdrawn: 0 }, { start: '2026-10-08', credited: 0, withdrawn: 40_000 }],
    curve: [{ date: '2026-10-07', total: 14_705_993 }, { date: '2026-10-08', total: 14_665_993 }],
    recent: [
      { ts: '2026-10-08T09:12+02:00', action: 'retirebal', template: '', delta: -40_000, by: 'Ariia I' },
      { ts: '2026-10-07T22:17+02:00', action: 'finacti', template: 'Donjon Groupe 5', delta: 1_302_644, by: 'Coskko' },
    ],
  };
}

describe('BalPage (Ma BAL)', () => {
  beforeAll(() => registerLocaleData(localeFr));

  async function render(h: MyBalHistory = history()) {
    TestBed.configureTestingModule({ imports: [BalPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BalPage);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((q) => q.url === '/api/guilds/111/bal/me/history');
    req.flush(h);
    http.expectOne('/api/guilds/111/bal/me').flush({ amount: 14_665_993, ig_name: 'Lilium122' });
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement, req };
  }

  it('ordinal', () => {
    expect(ordinal(1)).toBe('1er');
    expect(ordinal(4)).toBe('4e');
  });

  it('solde, pseudo et rang dans la guilde (30 jours par défaut)', async () => {
    const { el, req } = await render();
    expect(req.request.params.get('period')).toBe('30d');
    expect(el.querySelector('.amount')?.textContent?.replace(/\s/g, '')).toBe('14665993');
    expect(el.querySelector('.hero')?.textContent).toContain('Lilium122');
    expect(el.querySelector('.rank')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('4e BAL de la guilde sur 24');
  });

  it('pas de rang quand le joueur n’a pas de BAL', async () => {
    const { el } = await render(history('30d', null));
    expect(el.querySelector('.rank')).toBeNull();
  });

  it('gains, retraits et actis de la période', async () => {
    const { el } = await render();
    const tiles = [...el.querySelectorAll('.tile strong')].map((t) => t.textContent?.trim());
    expect(tiles).toEqual(['+13,4 M', '−40 k', '12']);
  });

  it('courbe du solde, graphe des gains et dernières opérations (plus récentes en premier)', async () => {
    const { el } = await render();
    expect(el.querySelector('app-line-chart svg')).not.toBeNull();
    expect(el.querySelector('app-flow-chart svg')).not.toBeNull();
    const ops = [...el.querySelectorAll('.recent li')];
    expect(ops.length).toBe(2);
    expect(ops[0].textContent).toContain('Retrait (payé)');
    expect(ops[0].textContent).toContain('09:12');
    expect(ops[0].textContent).toContain('par Ariia I');
    expect(ops[0].querySelector('.op-delta')?.textContent?.replace(/\s/g, '')).toBe('−40000');
    expect(ops[1].textContent).toContain("Fin d'activité · Donjon Groupe 5");
    expect(ops[1].querySelector('.op-delta')?.textContent?.replace(/\s/g, '')).toBe('+1302644');
  });

  it('changer de période recharge l’historique (Cette semaine)', async () => {
    const { fixture, http, el } = await render();
    el.querySelector<HTMLButtonElement>('app-period-picker button')!.click();
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/bal/me/history');
    expect(req.request.params.get('period')).toBe('week');
    req.flush(history('week'));
    await settle(fixture);
    expect(el.querySelector('app-period-picker button.on')?.textContent).toContain('Cette semaine');
  });
});
