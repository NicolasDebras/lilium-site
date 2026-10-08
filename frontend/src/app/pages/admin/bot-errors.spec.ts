import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BotErrorsPage } from '../../core/models';
import { BotErrors, errorWhen } from './bot-errors';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

function errors(total = 30): BotErrorsPage {
  return {
    items: [
      { id: 42, ts: '2026-10-08T09:12:44+00:00', command: 'acti', user_id: '123', error_type: 'KeyError',
        error_message: "'slots'" },
      { id: 41, ts: '2026-10-07T20:00:00+00:00', command: 'finacti', user_id: null, error_type: 'TimeoutError',
        error_message: '<script>alert(1)</script>' },
    ],
    total, page: 1, page_size: 25, commands: ['acti', 'finacti'],
  };
}

describe('BotErrors (page Admin)', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [BotErrors], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BotErrors);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  async function loaded() {
    const r = await render();
    r.http.expectOne((q) => q.url === '/api/guilds/111/admin/errors').flush(errors());
    await settle(r.fixture);
    return r;
  }

  it('liste les erreurs du serveur, messages affichés en texte brut', async () => {
    const { el } = await loaded();
    const rows = [...el.querySelectorAll('.list li')];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#42');
    expect(rows[0].textContent).toContain('acti · KeyError');
    expect(el.querySelector('script')).toBeNull();
    expect(rows[1].textContent).toContain('<script>alert(1)</script>');
    expect(el.querySelector('app-pager')?.textContent).toContain('sur 30 erreurs');
  });

  it('charge le traceback au clic seulement', async () => {
    const { fixture, http, el } = await loaded();
    (el.querySelector('.row') as HTMLButtonElement).click();
    http.expectOne('/api/guilds/111/admin/errors/42').flush({ ...errors().items[0], traceback: 'Traceback (most recent call last):' });
    await settle(fixture);
    expect(el.querySelector('pre')?.textContent).toContain('Traceback (most recent call last):');
    expect(el.querySelector('.row')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('filtre par commande et repart page 1', async () => {
    const { http, el } = await loaded();
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'finacti';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/errors');
    expect(req.request.params.get('command')).toBe('finacti');
    expect(req.request.params.get('page')).toBe('1');
  });

  it("affiche l'erreur de l'API (non admin)", async () => {
    const { fixture, http, el } = await render();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/errors')
      .flush({ detail: 'Réservé aux admins.' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(el.querySelector('.alert')?.textContent).toContain('Réservé aux admins.');
  });

  it('formate la date', () => {
    expect(errorWhen('pas une date')).toBe('pas une date');
    expect(errorWhen('2026-10-08T09:12:44+00:00')).toMatch(/08\/10\/2026/);
  });
});
