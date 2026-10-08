import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { JOKES, NotFoundPage, pickJoke } from './not-found';

describe('NotFoundPage (404)', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [NotFoundPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('affiche 404, une blague Albion et un lien vers l’accueil', () => {
    const { el } = render();
    expect(el.querySelector('.code')?.textContent).toBe('404');
    // seuls les guillemets extérieurs : certaines blagues en contiennent elles-mêmes
    const joke = el.querySelector('.joke')?.textContent?.trim().replace(/^«\s*|\s*»$/g, '');
    expect(JOKES).toContain(joke);
    expect(el.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/');
  });

  it('« Une autre blague » en change', () => {
    const { fixture, el } = render();
    const before = el.querySelector('.joke')?.textContent;
    el.querySelector<HTMLButtonElement>('button.btn')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.joke')?.textContent).not.toBe(before);
  });

  it('pickJoke ne renvoie jamais la blague précédente', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickJoke(JOKES[0])).not.toBe(JOKES[0]);
    }
    expect(pickJoke(undefined, () => 0)).toBe(JOKES[0]);
  });
});
