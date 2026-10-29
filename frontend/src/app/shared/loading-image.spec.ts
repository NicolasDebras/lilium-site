import { TestBed } from '@angular/core/testing';

import { LoadingImage } from './loading-image';
import { LysLoader } from './lys-loader';

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
    expect(el.querySelector('.loader app-lys-loader')).not.toBeNull();
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

describe('LysLoader', () => {
  it('décoratif (aria-hidden), taille réglable', () => {
    const fixture = TestBed.createComponent(LysLoader);
    fixture.componentRef.setInput('size', 64);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.getPropertyValue('--size')).toBe('64px');
    expect(el.querySelectorAll('.lys path')).toHaveLength(4);
  });
});
