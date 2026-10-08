import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { Level, PublicComposPage } from '../../core/models';
import { LibraryPage } from './library';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const PAGE: PublicComposPage = {
  items: [{ id: 3, name: 'ZvZ Statik', description: 'Compo 20', type_acti: 'PVP', image: '', author_name: 'Coskko',
            created_at: '2026-10-08T12:00+00:00', imports: 4, total: 5, builds: 1,
            pf1: [{ role: 'TANK', count: 2 }, { role: 'DPS', count: 3 }], pf2: [] }],
  total: 1, page: 1, page_size: 12,
};

describe('LibraryPage (modèles de compos)', () => {
  async function render(level: Level) {
    TestBed.configureTestingModule({
      imports: [LibraryPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': level } })],
    });
    const fixture = TestBed.createComponent(LibraryPage);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === '/api/public/compos').flush(PAGE);
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('liste les modèles avec rôles, auteur et nombre d’imports', async () => {
    const { el } = await render('member');
    expect(el.querySelector('.model h2')?.textContent).toBe('ZvZ Statik');
    expect(el.querySelector('.model')?.textContent).toContain('4 imports');
    expect(el.querySelectorAll('.roles li').length).toBe(2);
    expect(el.textContent).not.toContain('Importer dans ce serveur');   // pas staff
  });

  it('filtre PvE : recharge la page 1 avec type_acti', async () => {
    const { http, el } = await render('member');
    [...el.querySelectorAll<HTMLButtonElement>('.filters button')].find((b) => b.textContent === 'PvE')!.click();
    const req = http.expectOne((r) => r.url === '/api/public/compos');
    expect(req.request.params.get('type_acti')).toBe('PVE');
    expect(req.request.params.get('page')).toBe('1');
  });

  it('le staff importe le modèle puis revient aux compos', async () => {
    const { fixture, http, el } = await render('staff');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Importer'))!.click();
    const req = http.expectOne('/api/guilds/111/compos/import-public');
    expect(req.request.body).toEqual({ public_id: 3, new_name: null });
    req.flush({ name: 'ZvZ Statik' });
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'compos']);
  });

  it("l'image n'est chargée qu'à la demande", async () => {
    const { fixture, el } = await render('member');
    expect(el.querySelector('img.preview')).toBeNull();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes("Voir l'image"))!.click();
    fixture.detectChanges();
    expect(el.querySelector('img.preview')?.getAttribute('src')).toBe('/api/public/compos/3/image.png');
  });
});
