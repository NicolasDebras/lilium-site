/* Composants visuels partagés : icônes, logo, rôles, barre de composition, mini-inventaire,
   sélecteur de période, notifications. */
import { TestBed } from '@angular/core/testing';

import { TEST_ITEMS } from '../../testing/items';
import { ItemsService } from '../core/items.service';
import { ToastService } from '../core/toast.service';
import { Gear } from './gear';
import { ICONS, Icon } from './icon';
import { Logo } from './logo';
import { BAL_PERIODS, PeriodPicker, periodLabel } from './period-picker';
import { RoleBar, countByRole } from './role-bar';
import { roleColor, roleRank, sortByRole } from './roles';

describe('rôles', () => {
  it('couleur par rôle (tolère PF2: et la casse), gris pour un rôle inconnu', () => {
    expect(roleColor('TANK')).toBe('var(--role-tank)');
    expect(roleColor('PF2:dps')).toBe('var(--role-dps)');
    expect(roleColor('CALLER')).toBe('var(--role-other)');
  });

  it('tri TANK, HEAL, DPS, SUPPORT puis le reste, stable', () => {
    const rows = ['SUPPORT', 'X', 'DPS', 'TANK', 'Y', 'HEAL'];
    expect(sortByRole(rows, (r) => r)).toEqual(['TANK', 'HEAL', 'DPS', 'SUPPORT', 'X', 'Y']);
    expect(roleRank('PF2:HEAL')).toBe(1);
  });
});

describe('RoleBar', () => {
  it('countByRole additionne PF1 + PF2 et ignore les rôles à 0', () => {
    expect(countByRole([
      { role: 'DPS', count: 3 }, { role: 'TANK', count: 1 }, { role: 'DPS', count: 2 }, { role: 'HEAL', count: 0 },
    ])).toEqual([{ role: 'TANK', count: 1 }, { role: 'DPS', count: 5 }]);
  });

  it('un segment par rôle + légende avec nom et nombre', () => {
    const fixture = TestBed.createComponent(RoleBar);
    fixture.componentRef.setInput('rows', [{ role: 'DPS', count: 4 }, { role: 'HEAL', count: 1 }]);
    fixture.componentRef.setInput('emojis', { DPS: '⚔️' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll<HTMLElement>('.seg')].map((s) => s.style.flexGrow)).toEqual(['1', '4']);
    expect(el.querySelector('.bar')?.getAttribute('aria-label')).toBe('Composition : 1 HEAL, 4 DPS');
    expect(el.querySelector('.legend')?.textContent).toContain('⚔️ DPS 4');
  });
});

describe('Icon & Logo', () => {
  it('dessine le tracé de l’icône demandée', () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'search');
    fixture.componentRef.setInput('size', 24);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(ICONS.search);
  });

  it('logo : nom + BETA (désactivable)', () => {
    const fixture = TestBed.createComponent(Logo);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Lilium');
    expect(el.querySelector('.beta')).not.toBeNull();
    fixture.componentRef.setInput('beta', false);
    fixture.detectChanges();
    expect(el.querySelector('.beta')).toBeNull();
  });
});

describe('Gear (mini-inventaire)', () => {
  it('9 cases dans l’ordre du jeu, case libre « ? » et alternatives « +N »', async () => {
    TestBed.configureTestingModule({});
    const items = TestBed.inject(ItemsService);
    vi.spyOn(items, 'get').mockImplementation((id) => TEST_ITEMS.find((i) => i.id === id));
    const fixture = TestBed.createComponent(Gear);
    fixture.componentRef.setInput('items', { mainhand: ['MAIN_SWORD', '2H_HOLYSTAFF'], cape: ['*'], food: ['MEAL_STEW'] });
    fixture.componentRef.setInput('layout', 'doll');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cells = [...el.querySelectorAll('.doll .cell')];
    expect(cells.length).toBe(9);
    expect(cells[0].classList).toContain('blank');
    expect(cells[2].querySelector('.free')).not.toBeNull();         // cape (ligne 1, colonne 3)
    expect(cells[3].querySelector('img')?.getAttribute('alt')).toBe('Épée large');
    expect(cells[3].querySelector('.more')?.textContent).toBe('+1');
    expect(cells[8].querySelector('img')).not.toBeNull();             // bouffe en bas à droite
    expect(cells[1].classList).toContain('unset');                    // tête non précisée
    expect(cells[1].classList).not.toContain('empty');                // classe globale : étirerait la grille
  });
});

describe('PeriodPicker', () => {
  it('5 périodes, la courante en surbrillance, émet seulement un changement', () => {
    const fixture = TestBed.createComponent(PeriodPicker);
    fixture.componentRef.setInput('value', '30d');
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((p) => emitted.push(p));
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.length).toBe(BAL_PERIODS.length);
    expect(buttons.find((b) => b.classList.contains('on'))?.textContent?.trim()).toBe('30 jours');
    buttons[2].click();
    buttons[1].click();
    expect(emitted).toEqual(['7d']);
    expect(periodLabel('week')).toBe('Cette semaine');
  });
});

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ajoute, garde les 4 derniers et retire après le délai', () => {
    const toasts = TestBed.inject(ToastService);
    for (let i = 1; i <= 5; i++) toasts.success(`t${i}`);
    expect(toasts.toasts().map((t) => t.text)).toEqual(['t2', 't3', 't4', 't5']);
    vi.advanceTimersByTime(3600);
    expect(toasts.toasts()).toEqual([]);
  });

  it('les erreurs restent plus longtemps', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.error('oups');
    vi.advanceTimersByTime(4000);
    expect(toasts.toasts()[0]).toMatchObject({ kind: 'error', text: 'oups' });
  });
});
