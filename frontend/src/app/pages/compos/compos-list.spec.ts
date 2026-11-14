import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { Build, Compo, CompoList, Level } from '../../core/models';
import { ComposList, shareLabel } from './compos-list';

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

const BUILDS: Build[] = [
  { id: 12, name: 'Tank Masse', role: 'TANK', type_acti: 'PVP', weapon: '', spells: {}, items: {}, created_by_name: 'Lily', used_by: ['ZvZ'] },
  { id: 13, name: 'Tank Golem', role: 'TANK', type_acti: 'PVP', weapon: '', spells: {}, items: {}, created_by_name: 'Lily', used_by: ['ZvZ'] },
];

interface Options { levels?: Record<string, Level>; open?: string; list?: CompoList }

async function render(level: Level, options: Options = {}) {
  TestBed.configureTestingModule({
    imports: [ComposList],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                fakeAuth({ levels: options.levels ?? { '111': level } })],
  });
  const fixture = TestBed.createComponent(ComposList);
  fixture.componentRef.setInput('guildId', '111');
  if (options.open) fixture.componentRef.setInput('open', options.open);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const list = options.list ?? { custom: [compo('ZvZ', true), compo('Libre', false)], defaults: [] };
  http.match(() => true).forEach((req) => {
    if (req.request.url === '/api/guilds/111/compos') req.flush(list);
    else if (req.request.url === '/api/guilds/111/builds') req.flush(BUILDS);
    else req.flush([]);
  });
  await settle(fixture);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

function card(el: HTMLElement, name: string): HTMLElement {
  return [...el.querySelectorAll<HTMLElement>('article.compo')].find((a) => a.querySelector('h2')?.textContent === name)!;
}

function button(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text));
}

describe('ComposList — cartes repliées', () => {
  it('repliée par défaut : une pastille par ligne (build + nombre), liée au build, sans équipement', async () => {
    const { el } = await render('member');
    const zvz = card(el, 'ZvZ');
    expect(zvz.classList).not.toContain('open');
    expect(zvz.querySelector('.lines')).toBeNull();
    const pill = (root: HTMLElement) => {
      const li = root.querySelector('.summary li')!;
      return [li.querySelector('.sum-name')?.textContent, li.querySelector('.times')?.textContent];
    };
    expect(pill(zvz)).toEqual(['Tank Masse', '×2']);
    expect(zvz.querySelector('.summary a.sum-name')?.getAttribute('href')).toBe('/g/111/builds/12');
    // Ligne libre : rôle + armes conseillées, sans lien
    expect(pill(card(el, 'Libre'))).toEqual(['TANK · Masse', '×2']);
    expect(card(el, 'Libre').querySelector('.summary a')).toBeNull();
  });

  it('builds au choix : « A / B » dans le résumé, puis chacun avec son équipement une fois dépliée', async () => {
    const multi = { ...compo('ZvZ', true), pf1: [{ build_id: 12, alt_build_ids: [13], role: 'TANK', count: 3, weapon: '' }] } as Compo;
    const { fixture, el } = await render('member', { list: { custom: [multi], defaults: [] } });
    expect(card(el, 'ZvZ').querySelector('.summary li')?.textContent).toContain('Tank Masse / Tank Golem');
    button(card(el, 'ZvZ'), 'Détails')!.click();
    fixture.detectChanges();
    const names = [...card(el, 'ZvZ').querySelectorAll('.lines a.build-name')].map((a) => a.textContent);
    expect(names).toEqual(['Tank Masse', 'Tank Golem']);
  });

  it('« Détails » déplie les parties, « Replier » les referme', async () => {
    const { fixture, el } = await render('member');
    const toggle = button(card(el, 'ZvZ'), 'Détails')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').classList).toContain('open');
    expect(card(el, 'ZvZ').querySelector('.lines a.build-name')?.getAttribute('href')).toBe('/g/111/builds/12');
    expect(card(el, 'ZvZ').querySelector('.summary')).toBeNull();
    button(card(el, 'ZvZ'), 'Replier')!.click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').querySelector('.lines')).toBeNull();
  });

  it('clic sur la carte : la déplie ; dans le détail rien ne bouge ; l’en-tête la replie ; un lien garde son action', async () => {
    const { fixture, el } = await render('member');
    const zvz = () => card(el, 'ZvZ');
    // Lien vers le build : pas de dépliage (ctrl+clic sans action par défaut : aucune navigation pendant le test)
    el.addEventListener('click', (e) => e.preventDefault());
    zvz().querySelector('.summary a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    fixture.detectChanges();
    expect(zvz().classList).not.toContain('open');

    zvz().querySelector<HTMLElement>('app-role-bar')!.click();
    fixture.detectChanges();
    expect(zvz().classList).toContain('open');
    zvz().querySelector<HTMLElement>('.party')!.click();
    fixture.detectChanges();
    expect(zvz().classList).toContain('open');
    zvz().querySelector<HTMLElement>('.head h2')!.click();
    fixture.detectChanges();
    expect(zvz().classList).not.toContain('open');
  });

  it('?open=Nom (lien depuis un build) : cette compo arrive dépliée', async () => {
    const { el } = await render('member', { open: 'Libre' });
    expect(card(el, 'Libre').classList).toContain('open');
    expect(card(el, 'ZvZ').classList).not.toContain('open');
    expect(card(el, 'Libre').id).toBe('compo-libre');
  });
});

describe('ComposList — actions', () => {
  it('bouton Image seulement pour une compo avec build, même pour un simple membre', async () => {
    const { el } = await render('member');
    expect(button(card(el, 'ZvZ'), 'Image')).toBeDefined();
    expect(button(card(el, 'Libre'), 'Image')).toBeUndefined();
    expect(el.textContent).not.toContain('Modifier');
    expect(el.querySelector('a.duplicate')).toBeNull();
  });

  it("le clic affiche l'image générée par l'API, puis la referme", async () => {
    const { fixture, el } = await render('member');
    button(card(el, 'ZvZ'), 'Image')!.click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').querySelector('app-image-share img')?.getAttribute('src')).toBe('/api/guilds/111/compos/ZvZ/image.png');
    button(card(el, 'ZvZ'), 'Image')!.click();
    fixture.detectChanges();
    expect(card(el, 'ZvZ').querySelector('app-image-share')).toBeNull();
  });

  it('staff : Modifier visible repliée ; Publier, Copier et Supprimer une fois dépliée', async () => {
    const { fixture, http, el } = await render('staff', {
      levels: { '111': 'staff', '222': 'staff', '333': 'member' }, list: { custom: [compo('ZvZ', true)], defaults: [] },
    });
    const zvz = () => card(el, 'ZvZ');
    expect(zvz().querySelector('a[href="/g/111/compos/ZvZ/edit"]')).not.toBeNull();
    expect(zvz().querySelector('a.duplicate')?.getAttribute('href')).toBe('/g/111/compos/new?from=ZvZ');
    expect(button(zvz(), 'Supprimer')).toBeUndefined();
    expect(zvz().querySelector('select.copy')).toBeNull();

    button(zvz(), 'Détails')!.click();
    fixture.detectChanges();
    expect(button(zvz(), 'Supprimer')).toBeDefined();
    const options = [...zvz().querySelectorAll('select.copy option')].map((o) => o.textContent);
    expect(options).toEqual(['Copier vers…', 'Serveur 222']);   // ni le serveur courant ni un serveur membre

    const select = zvz().querySelector('select.copy') as HTMLSelectElement;
    select.value = '222';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne('/api/guilds/222/compos/import');
    expect(req.request.body).toEqual({ source_guild_id: 111, name: 'ZvZ', new_name: null });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(zvz(), 'Publier')!.click();
    http.expectOne('/api/guilds/111/compos/ZvZ/publish');
  });
});

describe('ComposList — parts de paie', () => {
  it('shareLabel : virgule française, pluriel à partir de 2', () => {
    expect(shareLabel(0.5)).toBe('0,5 part');
    expect(shareLabel(1.5)).toBe('1,5 part');
    expect(shareLabel(2)).toBe('2 parts');
  });

  it('affiche les parts ≠ 1 seulement quand elles sont personnalisées', async () => {
    const shared = { ...compo('Parts', false), custom_shares: true,
      pf1: [{ build_id: null, role: 'TANK', count: 1, weapon: '', share: 2 },
            { build_id: null, role: 'DPS', count: 3, weapon: '', share: 1 }] } as Compo;
    const plain = { ...compo('Sans', false), pf1: [{ build_id: null, role: 'TANK', count: 1, weapon: '', share: 2 }] } as Compo;
    const { fixture, el } = await render('member', { list: { custom: [shared, plain], defaults: [] }, open: 'Parts' });
    button(card(el, 'Sans'), 'Détails')!.click();
    fixture.detectChanges();
    const shares = [...el.querySelectorAll('.lines .share')].map((s) => s.textContent);
    expect(shares).toEqual([' · 💰 2 parts']);
  });
});
