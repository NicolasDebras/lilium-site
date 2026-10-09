import { TestBed } from '@angular/core/testing';

import { TierBadge } from './tier-badge';

describe('TierBadge', () => {
  function render(item: { slot: 'mainhand' | 'food'; tier?: number; enchant?: number }) {
    const fixture = TestBed.createComponent(TierBadge);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('« 8.1 », enchantement pour la couleur, survol « minimum ou équivalent »', () => {
    const el = render({ slot: 'mainhand', tier: 8, enchant: 1 });
    expect(el.textContent?.trim()).toBe('8.1');
    expect(el.getAttribute('data-enchant')).toBe('1');
    expect(el.getAttribute('title')).toBe('8.1 minimum ou équivalent (7.2, 6.3)');
    expect(el.classList).not.toContain('hidden');
  });

  it('bouffe : tier exact ; tier libre : masqué', () => {
    expect(render({ slot: 'food', tier: 8, enchant: 2 }).getAttribute('title')).toBe('8.2');
    const free = render({ slot: 'mainhand' });
    expect(free.classList).toContain('hidden');
    expect(free.getAttribute('title')).toBeNull();
  });
});
