import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ItemsService } from '../core/items.service';
import { TEST_SPELLS } from '../../testing/items';
import { SpellOption, SpellPicker } from './spell-picker';

describe('SpellPicker', () => {
  async function render(value = '', options: SpellOption[] = [{ id: 'DODGE', category: 'Plaque' }, { id: 'SPRINT_CD_REDUCTION', category: 'Cuir' }]) {
    TestBed.configureTestingModule({ imports: [SpellPicker], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const loading = TestBed.inject(ItemsService).loadSpells();
    TestBed.inject(HttpTestingController).expectOne('/api/spells').flush(TEST_SPELLS);
    await loading;
    const fixture = TestBed.createComponent(SpellPicker);
    fixture.componentRef.setInput('label', 'F');
    fixture.componentRef.setInput('title', 'Bottes au choix');
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('case vide = au choix ; case remplie = icône et nom du sort', async () => {
    const empty = await render();
    expect(empty.el.querySelector('.placeholder')?.textContent).toBe('?');
    expect(empty.el.querySelector('button.slot')?.getAttribute('aria-label')).toBe('F : Au choix');
    TestBed.resetTestingModule();
    const filled = await render('SPRINT_CD_REDUCTION');
    expect(filled.el.querySelector('button.slot img')?.getAttribute('src'))
      .toBe('https://render.albiononline.com/v1/spell/SPRINT_CD_REDUCTION.png?size=64');
    expect(filled.el.querySelector('button.slot')?.getAttribute('title')).toBe('Sprint rafraîchissant');
  });

  it('panneau : sorts groupés par famille, choisir puis « Au choix »', async () => {
    const { el, cmp, fixture } = await render();
    const picked: string[] = [];
    cmp.valueChange.subscribe((v) => picked.push(v));
    el.querySelector<HTMLButtonElement>('button.slot')!.click();
    fixture.detectChanges();
    expect([...el.querySelectorAll('.group')].map((g) => g.textContent)).toEqual(['Plaque', 'Cuir']);
    const results = [...el.querySelectorAll<HTMLButtonElement>('.result')];
    expect(results.map((r) => r.textContent?.trim())).toEqual(['Esquive', 'Sprint rafraîchissant']);
    results[1].click();
    fixture.detectChanges();
    expect(el.querySelector('.panel')).toBeNull();
    el.querySelector<HTMLButtonElement>('button.slot')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.free-btn')!.click();
    expect(picked).toEqual(['SPRINT_CD_REDUCTION', '']);
  });

  it('sans famille : un seul groupe sans titre ; aucun sort : message', async () => {
    const { el, fixture } = await render('', [{ id: 'DODGE' }]);
    el.querySelector<HTMLButtonElement>('button.slot')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.group')).toBeNull();
    TestBed.resetTestingModule();
    const none = await render('', []);
    none.el.querySelector<HTMLButtonElement>('button.slot')!.click();
    none.fixture.detectChanges();
    expect(none.el.querySelector('.panel p.muted')?.textContent).toContain('Aucun sort');
  });
});
