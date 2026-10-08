import { TestBed } from '@angular/core/testing';

import { ToastService } from '../core/toast.service';
import { ImageShare, fileSlug } from './image-share';

describe('ImageShare', () => {
  it('fileSlug : accents, espaces et symboles', () => {
    expect(fileSlug('Raid AVA #2')).toBe('raid-ava-2');
    expect(fileSlug('Équipe Élite')).toBe('equipe-elite');
    expect(fileSlug('###')).toBe('lilium');
  });

  function render() {
    TestBed.configureTestingModule({ imports: [ImageShare] });
    const f = TestBed.createComponent(ImageShare);
    f.componentRef.setInput('src', '/api/x.png');
    f.componentRef.setInput('fileName', 'compo-zvz');
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, toast: TestBed.inject(ToastService) };
  }

  it("affiche l'image et un lien de téléchargement nommé", () => {
    const { el } = render();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/x.png');
    expect(el.querySelector('a[download]')?.getAttribute('download')).toBe('compo-zvz.png');
  });

  it('copier : message d’erreur si le navigateur refuse', async () => {
    const { el, toast } = render();
    const error = vi.spyOn(toast, 'error');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')));
    el.querySelector('button')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(error).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
