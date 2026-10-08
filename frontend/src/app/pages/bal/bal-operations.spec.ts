import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { BalOperation, BalOperationsPage } from '../../core/models';
import { BalOperations } from './bal-operations';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const OPS: BalOperation[] = [
  { ts: '2026-10-08T09:12+02:00', action: 'retirebal', template: '', delta: -40_000, total: 14_665_993, by: 'Ariia I' },
  { ts: '2026-10-07T22:17+02:00', action: 'finacti', template: 'Donjon Groupe 5', delta: 1_302_644, total: null, by: 'Coskko' },
];

function page(p = 1, total = 40, items = OPS): BalOperationsPage {
  return { items, total, page: p, page_size: 25 };
}

describe('BalOperations (historique complet)', () => {
  beforeAll(() => registerLocaleData(localeFr));

  async function render() {
    TestBed.configureTestingModule({ imports: [BalOperations], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BalOperations);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('charge la page 1 sans filtre et affiche les opérations', async () => {
    const { fixture, http, el } = await render();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.has('action')).toBe(false);
    req.flush(page());
    await settle(fixture);

    const rows = [...el.querySelectorAll('.ops li')];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Retrait (payé)');
    expect(rows[0].textContent).toContain('solde');
    expect(rows[1].textContent).toContain("Fin d'activité · Donjon Groupe 5");
    expect(rows[1].textContent).not.toContain('solde');
    expect(el.querySelector('app-pager')?.textContent).toContain('sur 40 opérations');
  });

  it('filtre par type, repart page 1 et met à jour le lien CSV', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations').flush(page());
    await settle(fixture);
    expect(el.querySelector('a[download]')?.getAttribute('href')).toBe('/api/guilds/111/bal/me/operations.csv');

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'retirebal';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations');
    expect(req.request.params.get('action')).toBe('retirebal');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page(1, 1, [OPS[0]]));
    await settle(fixture);

    expect(el.querySelector('a[download]')?.getAttribute('href')).toBe('/api/guilds/111/bal/me/operations.csv?action=retirebal');
  });

  it('change de page via le pager', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations').flush(page());
    await settle(fixture);

    (el.querySelector('[aria-label="Page suivante"]') as HTMLButtonElement).click();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations');
    expect(req.request.params.get('page')).toBe('2');
  });

  it("affiche l'erreur de l'API", async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations')
      .flush({ detail: 'Réservé aux membres.' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(el.querySelector('.alert')?.textContent).toContain('Réservé aux membres.');
  });

  it('dit quand il n’y a aucune opération', async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/bal/me/operations').flush(page(1, 0, []));
    await settle(fixture);
    expect(el.textContent).toContain('Aucune opération');
  });
});
