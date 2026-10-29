import { TestBed } from '@angular/core/testing';

import { IconName } from './icon';
import { NavIcon } from './nav-icon';

describe('NavIcon (onglets animés)', () => {
  function render(name: IconName) {
    const fixture = TestBed.createComponent(NavIcon);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('Builds : épée qui frappe (lame + traînée)', () => {
    const el = render('sword');
    expect(el.querySelector('.blade')).not.toBeNull();
    expect(el.querySelector('.slash')).not.toBeNull();
  });

  it('Ma balance : deux pièces qui tombent sur la pile', () => {
    expect(render('coins').querySelectorAll('.drop')).toHaveLength(2);
  });

  it('Admin : bouclier avec deux yeux (pupilles mobiles)', () => {
    expect(render('shield').querySelectorAll('.pupils circle')).toHaveLength(2);
  });

  it('autres onglets : icône simple, décorative', () => {
    const el = render('book');
    expect(el.querySelector('app-icon')).not.toBeNull();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
