import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { debouncedSignal } from './debounce';

@Component({ template: '{{ debounced() }}' })
class Host {
  readonly source = signal('a');
  readonly debounced = debouncedSignal(this.source, 50);
}

describe('debouncedSignal', () => {
  it('donne la valeur initiale tout de suite, puis la dernière valeur après le délai', async () => {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    expect(host.debounced()).toBe('a');

    host.source.set('ab');
    fixture.detectChanges();
    host.source.set('abc');
    fixture.detectChanges();
    expect(host.debounced()).toBe('a');   // pas encore

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(host.debounced()).toBe('abc');   // une seule mise à jour, avec la dernière frappe
  });
});
