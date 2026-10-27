import { TestBed } from '@angular/core/testing';

import { LoadingImage } from './loading-image';

describe('LoadingImage', () => {
  function render(src = '/api/x.png') {
    TestBed.configureTestingModule({ imports: [LoadingImage] });
    const fixture = TestBed.createComponent(LoadingImage);
    fixture.componentRef.setInput('src', src);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('loader jusqu’au chargement, puis l’image ; repart en chargement sur une nouvelle adresse', () => {
    const { fixture, el } = render();
    expect(el.querySelector('.loader')?.textContent).toContain('Génération de l’image');
    el.querySelector('img')!.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(el.querySelector('.loader')).toBeNull();
    expect(el.querySelector('img')?.classList).toContain('ready');
    fixture.componentRef.setInput('src', '/api/y.png');
    fixture.detectChanges();
    expect(el.querySelector('.loader')).not.toBeNull();
  });

  it('erreur : message au lieu du loader', () => {
    const { fixture, el } = render();
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('.alert')?.textContent).toContain('Image indisponible');
  });
});
