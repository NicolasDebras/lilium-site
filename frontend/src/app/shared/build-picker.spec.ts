import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_ITEMS } from '../../testing/items';
import { ItemsService } from '../core/items.service';
import { Build } from '../core/models';
import { BuildChoice, BuildPicker } from './build-picker';

const build = (id: number, name: string, role: string, extra: Partial<Build> = {}): Build => ({
  id, name, role, type_acti: 'PVP', weapon: '', spells: {}, items: {}, created_by_name: 'Lily', used_by: [], ...extra,
});

const BUILDS: Build[] = [
  build(15, 'Heal Sacré', 'HEAL', { items: { mainhand: ['2H_HOLYSTAFF'] } }),
  build(12, 'Tank Masse', 'TANK', { items: { mainhand: ['MAIN_SWORD'] }, weapon: 'Épée large 8.1' }),
  build(13, 'Tank Golem', 'TANK'),
];

async function render(inputs: Partial<{ value: BuildChoice | null; taken: ReadonlySet<number>; role: string;
                                         lockRole: boolean; allowFree: boolean }> = {}) {
  TestBed.configureTestingModule({ imports: [BuildPicker], providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(BuildPicker);
  fixture.componentRef.setInput('builds', BUILDS);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  const picked: BuildChoice[] = [];
  fixture.componentInstance.pick.subscribe((c) => picked.push(c));
  const catalog = TestBed.inject(ItemsService).load();   // chargé par la page en vrai (icônes des armes)
  TestBed.inject(HttpTestingController).expectOne('/api/items').flush(TEST_ITEMS);
  await catalog;
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, picked, el: fixture.nativeElement as HTMLElement };
}

function openPanel(fixture: ComponentFixture<BuildPicker>, el: HTMLElement) {
  el.querySelector<HTMLButtonElement>('.trigger')!.click();
  fixture.detectChanges();
}

const names = (el: HTMLElement) => [...el.querySelectorAll('.opt-name')].map((n) => n.textContent);

function type(fixture: ComponentFixture<BuildPicker>, el: HTMLElement, text: string) {
  const input = el.querySelector<HTMLInputElement>('.panel .search')!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('BuildPicker', () => {
  it('bouton : le build choisi (icône de son arme, nom, rôle) ou le texte d’invite', async () => {
    const chosen = await render({ value: 12 });
    expect(chosen.el.querySelector('.trigger-name')?.textContent).toBe('Tank Masse');
    expect(chosen.el.querySelector('.trigger img')?.getAttribute('src')).toContain('render.albiononline.com');
    expect(chosen.el.querySelector('.trigger .role-tag')?.textContent).toBe('TANK');
    TestBed.resetTestingModule();
    const empty = await render();
    expect(empty.el.querySelector('.trigger')?.classList).toContain('empty');
    expect(empty.el.querySelector('.trigger-name')?.textContent).toBe('Choisir un build…');
  });

  it('liste rangée par rôle (TANK avant HEAL), pastilles de rôle, recherche sans accents sur le nom et les précisions', async () => {
    const { fixture, el } = await render();
    openPanel(fixture, el);
    expect(names(el)).toEqual(['Tank Masse', 'Tank Golem', 'Heal Sacré']);
    expect([...el.querySelectorAll('.chips .chip')].map((c) => c.textContent?.trim())).toEqual(['Tous', 'TANK', 'HEAL']);
    type(fixture, el, 'sacre');
    expect(names(el)).toEqual(['Heal Sacré']);
    type(fixture, el, 'epee');
    expect(names(el)).toEqual(['Tank Masse']);
    type(fixture, el, 'zzz');
    expect(el.querySelector('.none')?.textContent).toContain('Aucun build');
  });

  it('pastille de rôle : présélectionnée sur le rôle de la ligne, re-cliquée = tous', async () => {
    const { fixture, el } = await render({ role: 'HEAL' });
    openPanel(fixture, el);
    expect(names(el)).toEqual(['Heal Sacré']);
    el.querySelector<HTMLButtonElement>('.chips .chip.on')!.click();
    fixture.detectChanges();
    expect(names(el)).toHaveLength(3);
  });

  it('builds déjà pris : grisés, en bas, non sélectionnables', async () => {
    const { fixture, el, picked } = await render({ taken: new Set([12]) });
    openPanel(fixture, el);
    expect(names(el)).toEqual(['Tank Golem', 'Heal Sacré', 'Tank Masse']);
    const taken = [...el.querySelectorAll<HTMLButtonElement>('.option')].at(-1)!;
    expect(taken.disabled).toBe(true);
    expect(taken.textContent).toContain('déjà dans cette party');
    fixture.componentInstance.choose(12);
    expect(picked).toEqual([]);
  });

  it('clic : émet le build et referme ; « Sans build » émet « free »', async () => {
    const { fixture, el, picked } = await render();
    openPanel(fixture, el);
    el.querySelectorAll<HTMLButtonElement>('.option')[1].click();
    fixture.detectChanges();
    expect(picked).toEqual([13]);
    expect(el.querySelector('.panel')).toBeNull();
    openPanel(fixture, el);
    el.querySelector<HTMLButtonElement>('.free-btn')!.click();
    expect(picked).toEqual([13, 'free']);
  });

  it('clavier : ↓ puis Entrée choisit le 2e ; Échap referme', async () => {
    const { fixture, el, picked } = await render();
    openPanel(fixture, el);
    const input = el.querySelector<HTMLInputElement>('.panel .search')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(el.querySelectorAll('.option')[1].classList).toContain('active');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(picked).toEqual([13]);
    openPanel(fixture, el);
    el.querySelector('.panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.panel')).toBeNull();
  });

  it('rôle verrouillé (build au choix) : seulement ce rôle, sans pastilles ni « Sans build »', async () => {
    const { fixture, el } = await render({ role: 'TANK', lockRole: true, allowFree: false });
    openPanel(fixture, el);
    expect(names(el)).toEqual(['Tank Masse', 'Tank Golem']);
    expect(el.querySelector('.chips')).toBeNull();
    expect(el.querySelector('.free-btn')).toBeNull();
  });
});
