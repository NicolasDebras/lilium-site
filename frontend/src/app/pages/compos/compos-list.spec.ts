import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { Compo, CompoList, Level } from '../../core/models';
import { ComposList } from './compos-list';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

function compo(name: string, withBuild: boolean): Compo {
  return {
    name, description: '', type_acti: 'PVP', image: '', total: 2, custom: true,
    pf1: [{ build_id: withBuild ? 12 : null, role: 'TANK', count: 2, weapon: withBuild ? 'Tank Masse' : 'Masse' }], pf2: [],
  } as Compo;
}

describe('ComposList — image de la compo', () => {
  async function render(level: Level) {
    TestBed.configureTestingModule({
      imports: [ComposList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': level } })],
    });
    const fixture = TestBed.createComponent(ComposList);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const list: CompoList = { custom: [compo('ZvZ', true), compo('Libre', false)], defaults: [] };
    http.match(() => true).forEach((req) => {
      if (req.request.url === '/api/guilds/111/compos') req.flush(list);
      else if (req.request.url === '/api/guilds/111/builds') req.flush([]);
      else req.flush([]);
    });
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function card(el: HTMLElement, name: string): HTMLElement {
    return [...el.querySelectorAll<HTMLElement>('article.compo')].find((a) => a.querySelector('h2')?.textContent === name)!;
  }

  it('bouton Image seulement pour une compo avec build, même pour un simple membre', async () => {
    const { el } = await render('member');
    expect(card(el, 'ZvZ').textContent).toContain('Image');
    expect(card(el, 'Libre').querySelector('.foot')).toBeNull();
    expect(el.textContent).not.toContain('Modifier');
  });

  it("le clic affiche l'image générée par l'API, puis la referme", async () => {
    const { fixture, el } = await render('member');
    const button = () => [...card(el, 'ZvZ').querySelectorAll('button')].find((b) => b.textContent?.includes('Image'))!;
    button().click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').querySelector('app-image-share img')?.getAttribute('src')).toBe('/api/guilds/111/compos/ZvZ/image.png');
    button().click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').querySelector('app-image-share')).toBeNull();
  });

  it('le staff peut publier et copier vers ses autres serveurs staff', async () => {
    TestBed.configureTestingModule({
      imports: [ComposList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                  fakeAuth({ levels: { '111': 'staff', '222': 'staff', '333': 'member' } })],
    });
    const fixture = TestBed.createComponent(ComposList);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match(() => true).forEach((req) =>
      req.flush(req.request.url === '/api/guilds/111/compos' ? { custom: [compo('ZvZ', true)], defaults: [] } : []));
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const options = [...el.querySelectorAll('select.copy option')].map((o) => o.textContent);
    expect(options).toEqual(['Copier vers…', 'Serveur 222']);   // ni le serveur courant ni un serveur membre

    const select = el.querySelector('select.copy') as HTMLSelectElement;
    select.value = '222';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne('/api/guilds/222/compos/import');
    expect(req.request.body).toEqual({ source_guild_id: 111, name: 'ZvZ', new_name: null });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Publier'))!.click();
    http.expectOne('/api/guilds/111/compos/ZvZ/publish');
  });
});
