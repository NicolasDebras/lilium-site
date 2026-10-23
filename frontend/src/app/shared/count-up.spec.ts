import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { COUNT_UP_MS, CountUp } from './count-up';

@Component({
  imports: [CountUp],
  template: `<span [appCountUp]="value()" [countUpFormat]="format"></span>`,
})
class Host {
  readonly value = signal<number | null>(1500);
  readonly format = (n: number) => `${Math.round(n)} ag`;
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, span: fixture.nativeElement.querySelector('span') as HTMLElement };
}

describe('CountUp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sans animation possible (pas de matchMedia) : valeur finale tout de suite, « – » sans valeur', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { fixture, span } = render();
    expect(span.textContent).toBe('1500 ag');
    fixture.componentInstance.value.set(null);
    fixture.detectChanges();
    expect(span.textContent).toBe('–');
  });

  it('animations réduites : pas de défilement', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { span } = render();
    expect(span.textContent).toBe('1500 ag');
  });

  it('défile de 0 jusqu’à la valeur', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Angular planifie aussi ses rendus avec requestAnimationFrame : on joue toutes les images en attente.
    const play = (t: number) => frames.splice(0).forEach((cb) => cb((now = t)));
    const { span } = render();
    play(COUNT_UP_MS / 2);
    const middle = Number(span.textContent!.split(' ')[0]);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1500);
    play(COUNT_UP_MS);
    expect(span.textContent).toBe('1500 ag');
  });
});
