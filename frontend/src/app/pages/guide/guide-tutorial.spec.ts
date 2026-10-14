import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { TUTORIAL } from './guide-content';
import { GuideTutorial } from './guide-tutorial';

describe('GuideTutorial', () => {
  beforeEach(() => localStorage.clear());

  async function render(query = '') {
    TestBed.configureTestingModule({
      imports: [GuideTutorial],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ me: null })],
    });
    const fixture = TestBed.createComponent(GuideTutorial);
    fixture.componentRef.setInput('query', query);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/public/info').flush({ invite_url: 'https://discord.com/invite' });
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('une case par étape, cochée = mémorisée et comptée', async () => {
    const { fixture, el } = await render();
    expect(el.querySelectorAll('.step').length).toBe(TUTORIAL.length);
    expect(el.querySelector('.small')?.textContent).toContain(`0 / ${TUTORIAL.length}`);
    el.querySelector<HTMLInputElement>(`#${TUTORIAL[0].id} input[type=checkbox]`)!.click();
    fixture.detectChanges();
    expect(el.querySelector('.small')?.textContent).toContain(`1 / ${TUTORIAL.length}`);
    expect(el.querySelector(`#${TUTORIAL[0].id}`)?.classList).toContain('done');
    expect(JSON.parse(localStorage.getItem('lilium.guide.done')!)).toEqual([TUTORIAL[0].id]);
  });

  it('relit les étapes déjà faites et ignore un stockage abîmé', async () => {
    localStorage.setItem('lilium.guide.done', JSON.stringify([TUTORIAL[1].id, 42]));
    const { el } = await render();
    expect(el.querySelectorAll('.step.done').length).toBe(1);
  });

  it('la recherche ouvre l’aide « Ça ne marche pas ? » qui contient le mot', async () => {
    const step = TUTORIAL.find((s) => s.help)!;
    const word = step.help!.split(/\s+/).find((w) => w.length > 5)!;
    const { el } = await render(word);
    expect(el.querySelector<HTMLDetailsElement>(`#${step.id} details`)!.open).toBe(true);
  });
});
