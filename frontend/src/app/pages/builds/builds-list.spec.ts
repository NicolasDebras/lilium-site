import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { TEST_ITEMS } from '../../../testing/items';
import { Build, Level } from '../../core/models';
import { BuildsList } from './builds-list';

const BUILDS: Build[] = [
  { id: 1, name: 'Tank Masse', role: 'TANK', type_acti: 'PVP', weapon: '1H Masse', notes: '', image: '',
    items: { mainhand: ['MAIN_SWORD'], offhand: ['OFF_SHIELD'], head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'], cape: ['*'] },
    created_by_name: 'Lily' },
  { id: 2, name: 'Heal Sancti', role: 'HEAL', type_acti: 'PVE', weapon: '', notes: 'Note', image: '',
    items: {}, created_by_name: 'Lily' },
];

async function render(level: Level) {
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
  http.expectOne((r) => r.url === '/api/guilds/111/builds').flush(BUILDS);
  await fixture.whenStable();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('BuildsList', () => {
  it('affiche les builds avec leur rôle', async () => {
    const { el } = await render('member');
    const cards = el.querySelectorAll('article.build');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Tank Masse');
    expect(cards[0].textContent).toContain('🛡️ TANK');
  });

  it('affiche les icônes d’équipement du build, dans l’ordre des emplacements', async () => {
    const { el } = await render('member');
    const [first, second] = el.querySelectorAll('article.build');
    const icons = [...first.querySelectorAll<HTMLImageElement>('.gear img')].map((i) => i.alt);
    expect(icons).toEqual(['Épée large', 'Bouclier', 'Casque de soldat']);
    expect(first.querySelector('.gear img')?.getAttribute('src')).toContain('render.albiononline.com');
    expect(first.querySelector('.more')?.textContent).toContain('+1');
    expect(first.querySelector('.free')).not.toBeNull();
    expect(first.querySelector('.gear-names')?.textContent).toContain("Casque de soldat ou Capuchon d'ecclésiastique");
    expect(first.querySelector('.gear-names')?.textContent).toContain('Cape au choix');
    expect(second.querySelector('.gear')).toBeNull();
  });

  it('un membre ne voit pas les boutons d’édition', async () => {
    const { el } = await render('member');
    expect(el.textContent).not.toContain('Nouveau build');
    expect(el.textContent).not.toContain('Modifier');
    expect(el.textContent).not.toContain('Supprimer');
  });

  it('le staff voit les boutons d’édition', async () => {
    const { el } = await render('staff');
    expect(el.textContent).toContain('Nouveau build');
    expect(el.querySelectorAll('article.build .btn-danger').length).toBe(2);
  });

  it('un admin a aussi les droits staff', async () => {
    const { el } = await render('admin');
    expect(el.textContent).toContain('Nouveau build');
  });

  it('filtrer par rôle recharge avec le paramètre', async () => {
    const { fixture, http } = await render('member');
    fixture.componentInstance['role'].set('HEAL');
    void fixture.componentInstance.load();
    const req = http.expectOne((r) => r.url === '/api/guilds/111/builds');
    expect(req.request.params.get('role')).toBe('HEAL');
    req.flush([BUILDS[1]]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('article.build').length).toBe(1);
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

    function names(el: HTMLElement) {
      return [...el.querySelectorAll('article.build h2')].map((h) => h.textContent?.trim());
    }

    it('filtre par nom, sans tenir compte des majuscules ni des accents', async () => {
      const search = await searcher();
      expect(await search('sancti')).toEqual(['Heal Sancti']);
      expect(await search('MASSE')).toEqual(['Tank Masse']);
      expect(await search('')).toEqual(['Tank Masse', 'Heal Sancti']);
    });

    it('trouve un build par un objet de son équipement ou son rôle', async () => {
      const search = await searcher();
      expect(await search('bouclier')).toEqual(['Tank Masse']);
      expect(await search('ecclesiastique')).toEqual(['Tank Masse']);
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
    const req = http.expectOne('/api/guilds/111/builds/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    await fixture.whenStable();
    expect(el.querySelectorAll('article.build').length).toBe(1);
  });
});
