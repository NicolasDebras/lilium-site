import { TestBed } from '@angular/core/testing';

import { Pager, pageNumbers } from './pager';

describe('pageNumbers', () => {
  it('toutes les pages quand il y en a peu', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('« … » pour les trous, jamais pour une seule page manquante', () => {
    expect(pageNumbers(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, '…', 12]);
    expect(pageNumbers(12, 12)).toEqual([1, '…', 11, 12]);
    expect(pageNumbers(3, 12)).toEqual([1, 2, 3, 4, '…', 12]);
  });
});

describe('Pager', () => {
  function render(page: number, total: number, pageSize = 12) {
    const fixture = TestBed.createComponent(Pager);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageSize', pageSize);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('label', 'builds');
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, emitted };
  }

  it('masqué s’il n’y a qu’une page', () => {
    expect(render(1, 12).el.querySelector('.pager')).toBeNull();
  });

  it('affiche la plage et la page courante', () => {
    const { el } = render(2, 30);
    expect(el.querySelector('.range')?.textContent?.trim()).toBe('13–24 sur 30 builds');
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
  });

  it('dernière page incomplète', () => {
    expect(render(3, 30).el.querySelector('.range')?.textContent?.trim()).toBe('25–30 sur 30 builds');
  });

  it('Précédent désactivé en page 1, Suivant émet la page 2', () => {
    const { el, emitted } = render(1, 30);
    const [prev, ...rest] = el.querySelectorAll<HTMLButtonElement>('.pages button');
    const next = rest[rest.length - 1];
    expect(prev.disabled).toBe(true);
    next.click();
    expect(emitted).toEqual([2]);
  });

  it('cliquer un numéro émet cette page, pas la page courante', () => {
    const { el, emitted } = render(1, 30);
    const nums = [...el.querySelectorAll<HTMLButtonElement>('.num')];
    nums[0].click();          // page courante → rien
    nums[2].click();
    expect(emitted).toEqual([3]);
  });
});
