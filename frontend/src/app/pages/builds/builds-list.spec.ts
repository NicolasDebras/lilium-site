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
    items: { mainhand: ['MAIN_SWORD'], offhand: ['OFF_SHIELD'], head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'], cape: ['*'],
             swaps: ['MEAL_STEW'] },
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

  it('affiche l’équipement en mini-inventaire 3×3, disposé comme en jeu', async () => {
    const { el } = await render('member');
    const [first, second] = el.querySelectorAll('article.build');
    const cells = first.querySelectorAll('.doll .cell');
    expect(cells.length).toBe(9);
    // ligne 1 : (vide) tête cape · ligne 2 : arme armure main gauche
    const icons = [...first.querySelectorAll<HTMLImageElement>('.doll img')].map((i) => i.alt);
    expect(icons).toEqual(['Casque de soldat', 'Épée large', 'Bouclier']);
    expect(first.querySelector('.doll img')?.getAttribute('src')).toContain('render.albiononline.com');
    expect(first.querySelectorAll('.doll .empty').length).toBe(4);   // armure, potion, bottes, bouffe
    expect(first.querySelector('.more')?.textContent).toContain('+1');
    expect(first.querySelector('.free')).not.toBeNull();
    expect(first.querySelector('.gear-names')?.textContent).toContain("Casque de soldat ou Capuchon d'ecclésiastique");
    expect(first.querySelector('.gear-names')?.textContent).toContain('Cape au choix');
    expect(second.querySelector('.doll')).toBeNull();   // build sans équipement : pas d'inventaire
  });

  it('swaps : rangée d’icônes sous l’inventaire, hors du texte, mais trouvés par la recherche', async () => {
    const { fixture, el } = await render('member');
    const [first, second] = el.querySelectorAll('article.build');
    expect([...first.querySelectorAll<HTMLImageElement>('app-gear-swaps img')].map((i) => i.alt)).toEqual(['Ragoût de bœuf']);
    expect(first.querySelector('.doll app-gear-swaps, .doll ~ app-gear-swaps')).toBeNull();   // pas collés à l'inventaire
    expect(first.querySelector('.gear-names')?.textContent).not.toContain('Ragoût');
    expect(second.querySelector('app-gear-swaps img')).toBeNull();

    const input = el.querySelector<HTMLInputElement>('input.search')!;
    input.value = 'ragout';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect([...el.querySelectorAll('article.build h2')].map((h) => h.textContent?.trim())).toEqual(['Tank Masse']);
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

  it('filtres en pastilles : rôles (rangés TANK, HEAL…) et PVP/PVE rechargent la liste', async () => {
    const { fixture, http, el } = await render('member');
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.chips .chip')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Tous', '🛡️ TANK', '💚 HEAL']);

    chips[2].click();
    fixture.detectChanges();
    let req = http.expectOne((r) => r.url === '/api/guilds/111/builds');
    expect(req.request.params.get('role')).toBe('HEAL');
    req.flush([BUILDS[1]]);
    await fixture.whenStable();
    expect(el.querySelector('.chips .chip.on')?.textContent?.trim()).toBe('💚 HEAL');

    el.querySelectorAll<HTMLButtonElement>('.segmented button')[2].click();   // PVE
    fixture.detectChanges();
    req = http.expectOne((r) => r.url === '/api/guilds/111/builds');
    expect(req.request.params.get('type_acti')).toBe('PVE');
    req.flush([]);
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

  describe('pagination', () => {
    const MANY: Build[] = Array.from({ length: 30 }, (_, i) => ({
      ...BUILDS[1], id: 100 + i, name: `Build ${i + 1}`, role: i % 2 ? 'HEAL' : 'TANK',
    }));

    async function renderMany() {
      TestBed.configureTestingModule({
        imports: [BuildsList],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': 'member' } })],
      });
      const fixture = TestBed.createComponent(BuildsList);
      fixture.componentRef.setInput('guildId', '111');
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/api/items').flush(TEST_ITEMS);
      http.expectOne('/api/guilds/111/roles').flush([]);
      http.expectOne((r) => r.url === '/api/guilds/111/builds').flush(MANY);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const shown = () => [...el.querySelectorAll('article.build h2')].map((h) => h.textContent?.trim());
      return { fixture, el, shown };
    }

    it('12 builds par page, avec le pager', async () => {
      const { el, shown } = await renderMany();
      expect(shown().length).toBe(12);
      expect(shown()[0]).toBe('Build 1');
      expect(el.querySelector('app-pager .range')?.textContent?.trim()).toBe('1–12 sur 30 builds');
    });

    it('changer de page affiche la suite', async () => {
      const { fixture, el, shown } = await renderMany();
      el.querySelectorAll<HTMLButtonElement>('app-pager .num')[2].click();
      fixture.detectChanges();
      expect(shown()).toEqual(['Build 25', 'Build 26', 'Build 27', 'Build 28', 'Build 29', 'Build 30']);
    });

    it('une recherche revient à la page 1 et le pager suit le nombre de résultats', async () => {
      const { fixture, el, shown } = await renderMany();
      el.querySelectorAll<HTMLButtonElement>('app-pager .num')[1].click();
      fixture.detectChanges();
      expect(shown()[0]).toBe('Build 13');

      const input = el.querySelector<HTMLInputElement>('input.search')!;
      input.value = 'build 2';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(shown()[0]).toBe('Build 2');
      expect(el.querySelector('app-pager .pager')).toBeNull();   // 11 résultats → une seule page
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
