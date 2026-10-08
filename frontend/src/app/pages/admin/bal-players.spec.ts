import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { BalPlayer } from '../../core/models';
import { BalPlayers } from './bal-players';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const PLAYERS: BalPlayer[] = [
  { uid: '10', name: 'RE0', amount: 48_373_560 },
  { uid: '11', name: 'Ariia I', amount: 0 },
];

describe('BalPlayers (Admin → BAL par joueur)', () => {
  beforeAll(() => registerLocaleData(localeFr));

  async function loaded() {
    TestBed.configureTestingModule({ imports: [BalPlayers], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BalPlayers);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/bal/players');
    expect(req.request.params.get('q')).toBe('');
    req.flush(PLAYERS);
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('liste les joueurs avec leur solde', async () => {
    const { el } = await loaded();
    const rows = [...el.querySelectorAll('.list .row')];
    expect(rows.map((r) => r.querySelector('.name')?.textContent?.trim())).toEqual(['RE0', 'Ariia I']);
    expect(rows[1].querySelector('.amount')?.classList).toContain('zero');
  });

  it('cherche après un court délai', async () => {
    const { http, el } = await loaded();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'ari';
    input.dispatchEvent(new Event('input'));
    http.expectNone((q) => q.url === '/api/guilds/111/admin/bal/players');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/bal/players');
    expect(req.request.params.get('q')).toBe('ari');
  });

  it('un clic ouvre l’historique du joueur (route admin) avec son export CSV', async () => {
    const { fixture, http, el } = await loaded();
    (el.querySelector('.list .row') as HTMLButtonElement).click();
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/bal/players/10/operations');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0, page: 1, page_size: 25 });
    await settle(fixture);
    expect(el.querySelector('app-bal-operations h3')?.textContent).toContain('Historique de RE0');
    expect(el.querySelector('app-bal-operations a[download]')?.getAttribute('href'))
      .toBe('/api/guilds/111/admin/bal/players/10/operations.csv');
  });

  it('l’export de la guilde suit la période choisie', async () => {
    const { fixture, el } = await loaded();
    const link = () => el.querySelector('.export a[download]')?.getAttribute('href');
    expect(link()).toBe('/api/guilds/111/admin/bal/operations.csv?period=30d');
    const week = [...el.querySelectorAll<HTMLButtonElement>('app-period-picker button')][0];
    week.click();
    fixture.detectChanges();
    expect(link()).toBe('/api/guilds/111/admin/bal/operations.csv?period=week');
  });
});
