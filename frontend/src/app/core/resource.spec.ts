import { HttpErrorResponse } from '@angular/common/http';
import { Component, resource, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { errorText, lastValue } from './resource';

@Component({ template: '' })
class Host {
  readonly id = signal(1);
  readonly fail = signal(false);
  readonly res = resource({
    params: () => ({ id: this.id(), fail: this.fail() }),
    loader: async ({ params }) => {
      if (params.fail) throw new HttpErrorResponse({ status: 404, error: { detail: 'Introuvable.' } });
      return `valeur ${params.id}`;
    },
  });
  readonly last = lastValue(this.res);
  readonly error = errorText(this.res);
}

describe('lastValue / errorText', () => {
  it('garde la dernière valeur pendant le rechargement et après une erreur ; message de l’API', async () => {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    expect(host.last()).toBeNull();
    await fixture.whenStable();
    expect(host.last()).toBe('valeur 1');

    host.id.set(2);
    expect(host.res.hasValue()).toBe(false);   // la ressource repart de zéro…
    expect(host.last()).toBe('valeur 1');      // …mais l'ancienne valeur reste affichée
    await fixture.whenStable();
    expect(host.last()).toBe('valeur 2');

    host.fail.set(true);
    await fixture.whenStable();
    expect(host.error()).toBe('Introuvable.');
    expect(host.last()).toBe('valeur 2');
  });
});
