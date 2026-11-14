import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { TEST_ITEMS } from '../../../testing/items';
import { Build, Level } from '../../core/models';
import { BuildsList } from './builds-list';

const BUILDS: Build[] = [
  { id: 2, name: 'Heal Sancti', role: 'HEAL', type_acti: 'PVE', weapon: '', spells: {},
    items: {}, created_by_name: 'Lily', used_by: [] },
  { id: 1, name: 'Tank Masse', role: 'TANK', type_acti: 'PVP', weapon: '1H Masse', spells: {},
    items: { mainhand: ['T8_MAIN_SWORD@1'], offhand: ['OFF_SHIELD'], head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'], cape: ['*'],
             swaps: ['MEAL_STEW'] },
    created_by_name: 'Lily', used_by: ['Statik', 'ZvZ'] },
];

async function render(level: Level, builds: Build[] = BUILDS) {
  TestBed.configureTestingModule({
    imports: [BuildsList],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': level } })],
  });
  const fixture = TestBed.createComponent(BuildsList);
  fixture.componentRef.setInput('guildId', '111');
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/items').flush(TEST_ITEMS);
  http.expectOne('/api/guilds/111/roles').flush([{ name: 'TANK', emoji: '🛡️' }, { name: 'HEAL', emoji: '💚' }]);
  http.expectOne((r) => r.url === '/api/guilds/111/builds').flush(builds);
  await fixture.whenStable();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

function names(el: HTMLElement) {
  return [...el.querySelectorAll('li.build .name')].map((n) => n.textContent?.trim());
}

describe('BuildsList', () => {
  it('une ligne par build, rangées par rôle (TANK avant HEAL) sous un titre avec le nombre', async () => {
    const { el } = await render('member');
    const groups = [...el.querySelectorAll('section.group')];
    expect(groups.map((g) => [g.querySelector('.group-head .role-tag')?.textContent?.trim(), g.querySelector('.group-count')?.textContent]))
      .toEqual([['🛡️ TANK', '1'], ['💚 HEAL', '1']]);
    expect(names(el)).toEqual(['Tank Masse', 'Heal Sancti']);
    expect(el.querySelector('li.build .name')?.getAttribute('href')).toBe('/g/111/builds/1');
    expect(el.querySelector('li.build .weapon')?.textContent).toContain('1H Masse');
  });

  it('équipement en rangée compacte (pas de poupée), sans les swaps', async () => {
    const { el } = await render('member');
    const [tank, heal] = el.querySelectorAll('li.build');
    expect(tank.querySelector('.doll')).toBeNull();
    const icons = [...tank.querySelectorAll<HTMLImageElement>('app-gear .gear img')].map((i) => i.alt);
    expect(icons).toEqual(['Épée large', 'Bouclier', 'Casque de soldat']);
    expect(tank.querySelector('app-gear-swaps')).toBeNull();
    expect(heal.querySelector('app-gear .gear')).toBeNull();   // build sans équipement
  });

  it('dit dans quelles compos chaque build est utilisé, avec un lien vers chacune', async () => {
    const { el } = await render('member');
    const [tank, heal] = el.querySelectorAll('li.build');
    expect(tank.querySelector('.used summary')?.textContent).toContain('2 compos');
    const links = [...tank.querySelectorAll<HTMLAnchorElement>('.used-list a')];
    expect(links.map((a) => a.textContent)).toEqual(['Statik', 'ZvZ']);
    expect(links[1].getAttribute('href')).toBe('/g/111/compos?open=ZvZ');
    expect(heal.querySelector('.unused')?.textContent).toContain('Aucune compo');
  });

  it('filtre « Inutilisés » : seulement les builds sans compo', async () => {
    const { fixture, el } = await render('member');
    el.querySelector<HTMLButtonElement>('.unused-chip')!.click();
    fixture.detectChanges();
    expect(names(el)).toEqual(['Heal Sancti']);
    expect(el.querySelector('.unused-chip')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('replier un rôle masque ses builds', async () => {
    const { fixture, el } = await render('member');
    const toggle = el.querySelector<HTMLButtonElement>('.group-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(names(el)).toEqual(['Heal Sancti']);
  });

  it('un membre ne voit pas les boutons d’édition', async () => {
    const { el } = await render('member');
    expect(el.textContent).not.toContain('Nouveau build');
    expect(el.querySelector('li.build .actions')).toBeNull();
  });

  it('le staff modifie ; supprimer est désactivé tant que le build est dans une compo', async () => {
    const { el } = await render('staff');
    expect(el.textContent).toContain('Nouveau build');
    const [tank, heal] = el.querySelectorAll('li.build');
    expect(tank.querySelector('a.btn-icon')?.getAttribute('href')).toBe('/g/111/builds/1/edit');
    const usedDelete = tank.querySelector<HTMLButtonElement>('.btn-danger')!;
    expect(usedDelete.disabled).toBe(true);
    expect(usedDelete.title).toContain('Statik, ZvZ');
    expect(heal.querySelector<HTMLButtonElement>('.btn-danger')!.disabled).toBe(false);
  });

  it('un admin a aussi les droits staff', async () => {
    const { el } = await render('admin');
    expect(el.textContent).toContain('Nouveau build');
  });

  it('filtres en pastilles : rôles (rangés TANK, HEAL…) et PVP/PVE rechargent la liste', async () => {
    const { fixture, http, el } = await render('member');
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.chips .chip')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Tous', '🛡️ TANK', '💚 HEAL']);

    chips[2].click();
    fixture.detectChanges();
    let req = http.expectOne((r) => r.url === '/api/guilds/111/builds');
    expect(req.request.params.get('role')).toBe('HEAL');
    req.flush([BUILDS[0]]);
    await fixture.whenStable();
    expect(el.querySelector('.chips .chip.on')?.textContent?.trim()).toBe('💚 HEAL');
    expect(names(el)).toEqual(['Heal Sancti']);

    el.querySelectorAll<HTMLButtonElement>('.segmented button')[2].click();   // PVE
    fixture.detectChanges();
    req = http.expectOne((r) => r.url === '/api/guilds/111/builds');
    expect(req.request.params.get('type_acti')).toBe('PVE');
    req.flush([]);
  });

  it('beaucoup de builds : tous affichés, sans pagination', async () => {
    const many: Build[] = Array.from({ length: 30 }, (_, i) => ({
      ...BUILDS[0], id: 100 + i, name: `Build ${i + 1}`, role: i % 2 ? 'HEAL' : 'TANK',
    }));
    const { el } = await render('member', many);
    expect(names(el)).toHaveLength(30);
    expect(el.querySelector('app-pager')).toBeNull();
    expect(el.querySelector('.count')?.textContent).toContain('30 builds');
  });

  describe('recherche', () => {
    /** Rend la page une fois et renvoie une fonction « tape dans la recherche → builds affichés ». */
    async function searcher() {
      const r = await render('member');
      const input = r.el.querySelector<HTMLInputElement>('input.search')!;
      return async (text: string) => {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        r.fixture.detectChanges();
        await r.fixture.whenStable();
        return names(r.el);
      };
    }

    it('filtre par nom, sans tenir compte des majuscules ni des accents', async () => {
      const search = await searcher();
      expect(await search('sancti')).toEqual(['Heal Sancti']);
      expect(await search('MASSE')).toEqual(['Tank Masse']);
      expect(await search('')).toEqual(['Tank Masse', 'Heal Sancti']);
    });

    it('trouve un build par un objet de son équipement, ses swaps ou son rôle', async () => {
      const search = await searcher();
      expect(await search('bouclier')).toEqual(['Tank Masse']);
      expect(await search('ecclesiastique')).toEqual(['Tank Masse']);
      expect(await search('ragout')).toEqual(['Tank Masse']);
      expect(await search('heal')).toEqual(['Heal Sancti']);
    });

    it('tous les mots doivent correspondre', async () => {
      const search = await searcher();
      expect(await search('tank pve')).toEqual([]);
      expect(await search('tank pvp')).toEqual(['Tank Masse']);
    });

    it('affiche un message quand rien ne correspond', async () => {
      const r = await render('member');
      r.fixture.componentInstance['query'].set('zzz');
      r.fixture.detectChanges();
      expect(names(r.el)).toEqual([]);
      expect(r.el.querySelector('.empty')?.textContent).toContain('Aucun build ne correspond à « zzz »');
    });
  });

  it('supprimer retire le build après confirmation', async () => {
    const { fixture, http, el } = await render('staff');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const done = fixture.componentInstance.remove(BUILDS[0]);
    const req = http.expectOne('/api/guilds/111/builds/2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    await fixture.whenStable();
    expect(names(el)).toEqual(['Tank Masse']);
  });
});
