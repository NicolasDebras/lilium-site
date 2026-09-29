import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { AdminPage } from './admin';

/** Laisse ngOnInit (async) finir après le flush HTTP, puis rafraîchit la vue. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
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

  it('affiche les cartes de stats + la carte « À venir »', async () => {
    const { fixture, http, el } = await render();
    http.expectOne('/api/guilds/111/admin/overview').flush({ builds: 3, compos: 2, profiles: 42, total_bal: 1500000 });
    await settle(fixture);

    const cards = el.querySelectorAll('.stat');
    expect(cards.length).toBe(5);
    expect(el.textContent).toContain('42');
    expect(el.textContent).toContain('Profils enregistrés');
    expect(el.textContent?.replace(/\s/g, '')).toContain('1500000');
    expect(el.querySelector('.soon')?.textContent).toContain('À venir');
  });

  it('affiche le refus de l’API (403)', async () => {
    const { fixture, http, el } = await render();
    http.expectOne('/api/guilds/111/admin/overview').flush(
      { detail: 'Réservé aux admins du site (/webadmin).' }, { status: 403, statusText: 'Forbidden' },
    );
    await settle(fixture);
    expect(el.querySelector('.alert')?.textContent).toContain('/webadmin');
  });
});
